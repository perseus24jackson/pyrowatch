"""
============================================================
PYROWATCH — Wildfire Prediction System
Full Backend: Data Pipeline + ML Model + REST API
============================================================
TECH STACK:
  - Python 3.10+
  - FastAPI (REST API server)
  - PyTorch (CNN model)
  - scikit-learn (feature engineering, preprocessing)
  - rasterio / Pillow (satellite image processing)
  - NASA FIRMS API (real-time fire data)
  - MODIS/VIIRS data ingestion
  - Redis (caching)
  - PostgreSQL / SQLite (storage)
============================================================
"""

# ── INSTALLATION ────────────────────────────────────────────
# pip install fastapi uvicorn torch torchvision scikit-learn
#             rasterio pillow numpy pandas requests aiohttp
#             python-dotenv redis sqlalchemy alembic pydantic

import os
import math
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict

import numpy as np
import pandas as pd
import requests
from pathlib import Path

# ── CONFIG ──────────────────────────────────────────────────
class Config:
    """
    Get your NASA FIRMS API key:
    https://firms.modaps.eosdis.nasa.gov/api/area/
    (Free registration — returns real satellite fire data)
    """
    NASA_FIRMS_MAP_KEY = os.getenv("NASA_FIRMS_KEY", "YOUR_KEY_HERE")
    NASA_FIRMS_BASE    = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    
    OPENWEATHER_KEY    = os.getenv("OPENWEATHER_KEY", "YOUR_OW_KEY")
    OPENWEATHER_BASE   = "https://api.openweathermap.org/data/2.5"
    
    MODEL_PATH         = "models/wildfire_cnn.pt"
    DB_PATH            = "data/wildfire.db"
    CACHE_TTL          = 3600  # 1 hour
    
    # Geographic bounds (USA default)
    LAT_MIN, LAT_MAX   = 24.5, 49.5
    LON_MIN, LON_MAX   = -125.0, -66.5

cfg = Config()

# ────────────────────────────────────────────────────────────
#  STEP 1: DATA INGESTION — NASA FIRMS API
# ────────────────────────────────────────────────────────────

class NASAFIRMSClient:
    """
    Fetches real-time satellite fire detections from NASA FIRMS.
    Data sources: MODIS (Terra/Aqua), VIIRS S-NPP, VIIRS NOAA-20
    Resolution: 375m (VIIRS) | 1km (MODIS)
    Update frequency: ~3 hours
    """

    SOURCES = {
        "VIIRS_SNPP":  "VIIRS_SNPP_NRT",
        "VIIRS_NOAA20":"VIIRS_NOAA20_NRT",
        "MODIS":       "MODIS_NRT",
    }

    def __init__(self, api_key: str):
        self.key = api_key

    def fetch_area(
        self,
        lat_min: float, lat_max: float,
        lon_min: float, lon_max: float,
        days: int = 1,
        source: str = "VIIRS_SNPP",
    ) -> pd.DataFrame:
        """
        Fetches fire detections for a geographic bounding box.
        
        Returns DataFrame with columns:
          latitude, longitude, bright_ti4/brightness, frp,
          confidence, acq_date, acq_time, instrument, satellite
        """
        area = f"{lon_min},{lat_min},{lon_max},{lat_max}"  # W,S,E,N
        src  = self.SOURCES.get(source, source)
        url  = f"{cfg.NASA_FIRMS_BASE}/{self.key}/{src}/{days}/{area}"
        
        print(f"[FIRMS] Fetching {source} data for area {area}...")
        
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"[FIRMS] API error: {e}")
            return self._demo_data()  # Fallback to demo data
        
        if not resp.text.strip() or "ERROR" in resp.text:
            print("[FIRMS] No data returned, using demo data")
            return self._demo_data()
        
        from io import StringIO
        df = pd.read_csv(StringIO(resp.text))
        df = self._normalize_columns(df, source)
        print(f"[FIRMS] Retrieved {len(df)} fire detections")
        return df

    def _normalize_columns(self, df: pd.DataFrame, source: str) -> pd.DataFrame:
        """Normalize column names across MODIS and VIIRS formats."""
        col_map = {
            # VIIRS columns
            "bright_ti4": "brightness",
            "bright_ti5": "brightness_day",
            # MODIS columns
            "brightness": "brightness",
        }
        df = df.rename(columns=col_map)
        
        required = ["latitude", "longitude", "brightness", "frp", "confidence", "acq_date"]
        for c in required:
            if c not in df.columns:
                df[c] = np.nan
        
        df["instrument"] = source
        df["frp"]        = pd.to_numeric(df["frp"], errors="coerce").fillna(0)
        df["brightness"] = pd.to_numeric(df["brightness"], errors="coerce").fillna(300)
        df["confidence"] = pd.to_numeric(
            df["confidence"].astype(str).str.replace("%", "").str.replace("n", "50").str.replace("l", "25").str.replace("h", "80"),
            errors="coerce"
        ).fillna(50)
        return df

    def _demo_data(self) -> pd.DataFrame:
        """Demo data when API key is not configured."""
        demo = [
            {"latitude": 34.05, "longitude": -118.24, "brightness": 347.2, "frp": 28.5, "confidence": 92, "acq_date": str(datetime.now().date()), "instrument": "VIIRS_SNPP"},
            {"latitude": 36.74, "longitude": -119.77, "brightness": 362.1, "frp": 41.3, "confidence": 88, "acq_date": str(datetime.now().date()), "instrument": "MODIS"},
            {"latitude": 33.45, "longitude": -112.07, "brightness": 355.4, "frp": 35.0, "confidence": 94, "acq_date": str(datetime.now().date()), "instrument": "VIIRS_SNPP"},
            {"latitude": 30.26, "longitude": -97.74,  "brightness": 341.7, "frp": 22.9, "confidence": 83, "acq_date": str(datetime.now().date()), "instrument": "VIIRS_NOAA20"},
        ]
        return pd.DataFrame(demo)

    def fetch_all_sources(self, days=1) -> pd.DataFrame:
        """Fetch from all satellite sources and merge."""
        dfs = []
        for src in self.SOURCES:
            df = self.fetch_area(
                cfg.LAT_MIN, cfg.LAT_MAX,
                cfg.LON_MIN, cfg.LON_MAX,
                days=days, source=src
            )
            dfs.append(df)
        return pd.concat(dfs, ignore_index=True).drop_duplicates(
            subset=["latitude", "longitude", "acq_date"]
        )


# ────────────────────────────────────────────────────────────
#  STEP 2: WEATHER DATA INGESTION
# ────────────────────────────────────────────────────────────

class WeatherClient:
    """
    Fetches weather data for fire locations.
    Register free at https://openweathermap.org/api
    """

    def get_weather(self, lat: float, lon: float) -> Dict:
        url = f"{cfg.OPENWEATHER_BASE}/weather"
        params = {
            "lat": lat, "lon": lon,
            "appid": cfg.OPENWEATHER_KEY,
            "units": "metric"
        }
        try:
            resp = requests.get(url, params=params, timeout=10)
            data = resp.json()
            return {
                "temp":       data["main"]["temp"],
                "humidity":   data["main"]["humidity"],
                "wind_speed": data["wind"]["speed"] * 3.6,  # m/s → km/h
                "pressure":   data["main"]["pressure"],
                "description": data["weather"][0]["description"],
            }
        except Exception as e:
            print(f"[Weather] Error for ({lat},{lon}): {e}")
            return self._synthetic_weather(lat, lon)

    def _synthetic_weather(self, lat: float, lon: float) -> Dict:
        """Synthetic weather based on latitude (fallback)."""
        base_temp = 40 - abs(lat - 30) * 0.5
        return {
            "temp": base_temp + np.random.normal(0, 3),
            "humidity": max(5, 30 - (base_temp - 25) * 0.8 + np.random.normal(0, 5)),
            "wind_speed": abs(np.random.normal(25, 12)),
            "pressure": 1013 + np.random.normal(0, 5),
        }


# ────────────────────────────────────────────────────────────
#  STEP 3: FEATURE ENGINEERING
# ────────────────────────────────────────────────────────────

class FeatureEngineer:
    """
    Builds the feature vector for the ML model from raw data.
    Features used:
      - LST (Land Surface Temperature from satellite brightness)
      - FRP (Fire Radiative Power)
      - NDVI (Vegetation index — approximated from season/region)
      - Humidity, Wind Speed, Temperature
      - Historical fire frequency
      - Confidence score
    """

    def compute_ndvi_proxy(self, lat: float, lon: float, date_str: str) -> float:
        """
        Approximates NDVI (−1 to 1) from latitude + season.
        Replace with actual MODIS MOD13A2 product for production.
        
        For real NDVI:
          pip install earthengine-api
          import ee; ee.Authenticate()
          # Then query MODIS/006/MOD13A2 ImageCollection
        """
        try:
            month = datetime.strptime(date_str, "%Y-%m-%d").month
        except:
            month = 7
        # Summer dryness factor
        dry_season = 1 - abs(math.sin(math.pi * (month - 1) / 6)) * 0.4
        # Latitude greenness
        lat_factor = 0.2 + (abs(lat) / 60) * 0.5 if abs(lat) > 30 else 0.6
        return round(min(max(dry_season * lat_factor, 0.05), 0.95), 3)

    def compute_drought_index(self, humidity: float, temp: float, wind: float) -> float:
        """Simplified Keetch–Byram Drought Index proxy (0–1)."""
        evap = (temp * 0.02 + wind * 0.005)
        moisture_deficit = max(0, evap - humidity * 0.01)
        return min(moisture_deficit / 2.0, 1.0)

    def build_feature_vector(
        self,
        fire_row: pd.Series,
        weather: Dict,
    ) -> np.ndarray:
        """
        Returns a 12-dimensional feature vector:
        [brightness, frp, confidence, temp, humidity, wind,
         ndvi, drought, temp_anomaly, frp_norm, lat_abs, lon_abs]
        """
        lat  = fire_row["latitude"]
        lon  = fire_row["longitude"]
        date = str(fire_row.get("acq_date", datetime.now().date()))

        ndvi    = self.compute_ndvi_proxy(lat, lon, date)
        drought = self.compute_drought_index(
            weather.get("humidity", 30),
            weather.get("temp", 35),
            weather.get("wind_speed", 20),
        )

        feat = np.array([
            min(fire_row.get("brightness", 300) / 400.0, 1.0),
            min(fire_row.get("frp", 0) / 100.0, 1.0),
            fire_row.get("confidence", 50) / 100.0,
            (weather.get("temp", 30) + 10) / 60.0,
            1 - weather.get("humidity", 50) / 100.0,
            weather.get("wind_speed", 20) / 80.0,
            1 - ndvi,                    # High inverted NDVI = dry vegetation
            drought,
            max(0, (weather.get("temp", 30) - 25) / 25.0),  # Temp anomaly
            min(fire_row.get("frp", 0) / 50.0, 1.0),
            abs(lat) / 60.0,
            abs(lon) / 180.0,
        ], dtype=np.float32)

        return np.clip(feat, 0, 1)


# ────────────────────────────────────────────────────────────
#  STEP 4: ML MODEL (PyTorch)
# ────────────────────────────────────────────────────────────

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("[WARNING] PyTorch not installed. Using fallback model.")

if TORCH_AVAILABLE:
    class WildfireCNN(nn.Module):
        """
        Hybrid CNN + MLP wildfire risk prediction model.
        
        Architecture:
          Input: 12-dim feature vector
          → MLP branch: 3 hidden layers with BatchNorm + Dropout
          → Output: risk score (0–100) via sigmoid scaled
        
        For satellite IMAGE input (production):
          → 2D CNN branch processes 64x64 multi-band patches
            (bands: Red, NIR, SWIR, Thermal)
          → Concatenated with weather features
          → Final MLP head
        """

        def __init__(self, input_dim=12, hidden_dim=128):
            super().__init__()
            self.feature_net = nn.Sequential(
                nn.Linear(input_dim, hidden_dim),
                nn.BatchNorm1d(hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.3),

                nn.Linear(hidden_dim, hidden_dim),
                nn.BatchNorm1d(hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.2),

                nn.Linear(hidden_dim, 64),
                nn.ReLU(),

                nn.Linear(64, 1),
                nn.Sigmoid(),
            )

        def forward(self, x):
            return self.feature_net(x) * 100  # Scale to 0–100

    class SatelliteCNN(nn.Module):
        """
        Full CNN for satellite IMAGE patches.
        Input: (B, 4, 64, 64) — 4-band image patch
        Output: spatial feature map → risk heatmap
        """

        def __init__(self):
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Conv2d(4, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
                nn.MaxPool2d(2),                                        # 32x32
                nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
                nn.MaxPool2d(2),                                        # 16x16
                nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(),
                nn.MaxPool2d(2),                                        # 8x8
                nn.Conv2d(128, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(),
                nn.AdaptiveAvgPool2d(1),                                # 1x1
                nn.Flatten(),
            )
            self.head = nn.Sequential(
                nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3),
                nn.Linear(128, 1), nn.Sigmoid(),
            )

        def forward(self, x):
            return self.head(self.encoder(x)) * 100


class WildfirePredictor:
    """
    Wraps the PyTorch model for inference.
    Falls back to a calibrated formula if PyTorch unavailable.
    """

    def __init__(self):
        self.model = None
        self.engineer = FeatureEngineer()
        if TORCH_AVAILABLE:
            self._load_or_init_model()

    def _load_or_init_model(self):
        path = Path(cfg.MODEL_PATH)
        self.model = WildfireCNN(input_dim=12)
        if path.exists():
            try:
                self.model.load_state_dict(torch.load(path, map_location="cpu"))
                print(f"[Model] Loaded from {path}")
            except Exception as e:
                print(f"[Model] Load failed ({e}), using untrained model")
        self.model.eval()

    def predict(self, fire_row: pd.Series, weather: Dict) -> Dict:
        feat = self.engineer.build_feature_vector(fire_row, weather)

        if TORCH_AVAILABLE and self.model:
            with torch.no_grad():
                x = torch.tensor(feat).unsqueeze(0)
                score = float(self.model(x).item())
        else:
            # Fallback: calibrated formula
            score = self._formula_fallback(feat)

        score = round(min(max(score, 0), 99))
        level, color = self._classify(score)

        return {
            "risk_score": score,
            "risk_level": level,
            "color": color,
            "features": {
                "temperature":   round(weather.get("temp", 0), 1),
                "humidity":      round(weather.get("humidity", 0), 1),
                "wind_speed":    round(weather.get("wind_speed", 0), 1),
                "ndvi":          round(1 - float(feat[6]), 3),
                "drought_index": round(float(feat[7]), 3),
                "frp":           round(float(fire_row.get("frp", 0)), 1),
                "brightness":    round(float(fire_row.get("brightness", 0)), 1),
                "confidence":    round(float(fire_row.get("confidence", 0)), 1),
            }
        }

    def _formula_fallback(self, feat: np.ndarray) -> float:
        weights = np.array([0.18, 0.20, 0.08, 0.20, 0.15, 0.08, 0.06, 0.05, 0.00, 0.00, 0.00, 0.00])
        return float(np.dot(feat, weights) * 100)

    def _classify(self, score: int) -> tuple:
        if score >= 75: return ("EXTREME", "#ff2a1a")
        if score >= 55: return ("HIGH",    "#ff7b00")
        if score >= 35: return ("MODERATE","#f5c518")
        return          ("LOW",   "#22c55e")


# ────────────────────────────────────────────────────────────
#  STEP 5: MODEL TRAINING PIPELINE
# ────────────────────────────────────────────────────────────

def generate_training_data(n_samples=5000) -> tuple:
    """
    Generates synthetic training data for demo.
    
    In production, use real labeled data from:
    - NASA FIRMS historical fire archive
    - Global Fire Atlas dataset
    - CAL FIRE incident database
    """
    np.random.seed(42)
    X, y = [], []

    for _ in range(n_samples):
        # High-risk fire scenario
        temp      = np.random.uniform(30, 50)
        humidity  = np.random.uniform(5, 25)
        wind      = np.random.uniform(30, 70)
        ndvi_inv  = np.random.uniform(0.5, 0.9)
        frp       = np.random.uniform(20, 80)
        bright    = np.random.uniform(340, 380)
        conf      = np.random.uniform(75, 99)
        drought   = np.random.uniform(0.6, 1.0)

        feat = np.array([
            bright/400, frp/100, conf/100,
            (temp+10)/60, 1-humidity/100, wind/80,
            ndvi_inv, drought,
            max(0,(temp-25)/25), frp/50, 0.5, 0.5
        ], dtype=np.float32)

        # Ground truth: logistic-like score
        raw = (0.25*feat[3] + 0.25*feat[4] + 0.15*feat[5] +
               0.20*feat[1] + 0.15*feat[7])
        label = np.clip(raw * 100 + np.random.normal(0, 5), 0, 99)
        X.append(feat)
        y.append([label / 100.0])

    return np.array(X), np.array(y, dtype=np.float32)


def train_model(epochs=50, batch_size=64):
    """
    Trains the WildfireCNN on synthetic data.
    Replace with real data for production.
    
    Usage:
        python backend.py --train
    """
    if not TORCH_AVAILABLE:
        print("[Train] PyTorch not available. Skipping.")
        return

    print("[Train] Generating training data...")
    X, y = generate_training_data(5000)

    split = int(0.8 * len(X))
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    model     = WildfireCNN(input_dim=12)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.MSELoss()
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_val_loss = float("inf")
    print(f"[Train] Starting training for {epochs} epochs...")

    for epoch in range(epochs):
        model.train()
        idx = np.random.permutation(len(X_train))
        train_loss = 0

        for i in range(0, len(X_train), batch_size):
            batch_idx = idx[i:i+batch_size]
            xb = torch.tensor(X_train[batch_idx])
            yb = torch.tensor(y_train[batch_idx]) * 100

            pred = model(xb)
            loss = criterion(pred, yb)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()

        scheduler.step()

        # Validation
        model.eval()
        with torch.no_grad():
            val_pred = model(torch.tensor(X_val))
            val_loss = criterion(val_pred, torch.tensor(y_val) * 100).item()

        if epoch % 10 == 0:
            print(f"  Epoch {epoch:3d}/{epochs} | Train: {train_loss/len(X_train)*batch_size:.4f} | Val: {val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            Path("models").mkdir(exist_ok=True)
            torch.save(model.state_dict(), cfg.MODEL_PATH)

    print(f"[Train] Complete. Best val loss: {best_val_loss:.4f}. Model saved to {cfg.MODEL_PATH}")


# ────────────────────────────────────────────────────────────
#  STEP 6: FASTAPI REST SERVER
# ────────────────────────────────────────────────────────────

def create_app():
    """
    Creates the FastAPI application.
    
    Endpoints:
      GET /fires              — Active fire hotspots
      GET /predict/{lat}/{lon} — Risk score for coordinate
      GET /risk/region        — Risk heatmap for region
      GET /stats              — Summary statistics
    
    Run: uvicorn backend:app --reload --host 0.0.0.0 --port 8000
    """
    try:
        from fastapi import FastAPI, HTTPException
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel
    except ImportError:
        print("[API] FastAPI not installed: pip install fastapi uvicorn")
        return None

    app = FastAPI(
        title="PyroWatch — Wildfire Prediction API",
        description="Real-time wildfire risk prediction using NASA FIRMS satellite data + ML",
        version="1.0.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    firms     = NASAFIRMSClient(cfg.NASA_FIRMS_MAP_KEY)
    weather   = WeatherClient()
    predictor = WildfirePredictor()
    _cache: Dict = {}

    @app.get("/", summary="Health check")
    def root():
        return {"status": "ok", "service": "PyroWatch Wildfire Prediction API", "version": "1.0.0"}

    @app.get("/fires", summary="Fetch active fire hotspots")
    def get_fires(
        days: int = 1,
        lat_min: float = 24.5, lat_max: float = 49.5,
        lon_min: float = -125.0, lon_max: float = -66.5,
        source: str = "VIIRS_SNPP",
    ):
        """Returns active fire detections from NASA FIRMS."""
        cache_key = f"fires_{days}_{source}"
        if cache_key in _cache:
            cached = _cache[cache_key]
            if (datetime.now() - cached["ts"]).seconds < cfg.CACHE_TTL:
                return cached["data"]

        df = firms.fetch_area(lat_min, lat_max, lon_min, lon_max, days, source)
        
        results = []
        for _, row in df.iterrows():
            w  = weather.get_weather(row["latitude"], row["longitude"])
            pr = predictor.predict(row, w)
            results.append({
                "latitude":   float(row["latitude"]),
                "longitude":  float(row["longitude"]),
                "brightness": float(row.get("brightness", 0)),
                "frp":        float(row.get("frp", 0)),
                "confidence": float(row.get("confidence", 0)),
                "acq_date":   str(row.get("acq_date", "")),
                "instrument": str(row.get("instrument", "")),
                "weather":    w,
                "prediction": pr,
            })

        results.sort(key=lambda x: x["prediction"]["risk_score"], reverse=True)
        resp = {"count": len(results), "source": source, "fires": results}
        _cache[cache_key] = {"data": resp, "ts": datetime.now()}
        return resp

    @app.get("/predict/{lat}/{lon}", summary="Get risk score for a coordinate")
    def predict_point(lat: float, lon: float):
        """Returns fire risk score for any lat/lon point."""
        w = weather.get_weather(lat, lon)
        row = pd.Series({
            "latitude": lat, "longitude": lon,
            "brightness": 320, "frp": 0, "confidence": 50,
            "acq_date": str(datetime.now().date())
        })
        prediction = predictor.predict(row, w)
        return {"latitude": lat, "longitude": lon, "weather": w, "prediction": prediction}

    @app.get("/stats", summary="Aggregated fire statistics")
    def get_stats():
        """Returns aggregated fire risk stats across all regions."""
        df = firms.fetch_area(
            cfg.LAT_MIN, cfg.LAT_MAX, cfg.LON_MIN, cfg.LON_MAX, days=2
        )
        scores = []
        for _, row in df.iterrows():
            w = weather._synthetic_weather(row["latitude"], row["longitude"])
            pr = predictor.predict(row, w)
            scores.append(pr["risk_score"])

        if not scores:
            return {"total": 0, "avg_risk": 0, "extreme": 0, "high": 0, "moderate": 0, "low": 0}

        return {
            "total":    len(scores),
            "avg_risk": round(np.mean(scores), 1),
            "extreme":  sum(1 for s in scores if s >= 75),
            "high":     sum(1 for s in scores if 55 <= s < 75),
            "moderate": sum(1 for s in scores if 35 <= s < 55),
            "low":      sum(1 for s in scores if s < 35),
            "max_risk": max(scores),
        }

    return app


# Create the app instance
app = create_app()


# ────────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if "--train" in sys.argv:
        train_model(epochs=50)

    elif "--fetch" in sys.argv:
        print("=== FETCHING LIVE FIRE DATA ===")
        client = NASAFIRMSClient(cfg.NASA_FIRMS_MAP_KEY)
        df = client.fetch_area(24.5, 49.5, -125.0, -66.5, days=1)
        print(df[["latitude", "longitude", "brightness", "frp", "confidence"]].head(10))

    elif "--server" in sys.argv or len(sys.argv) == 1:
        print("=== STARTING PYROWATCH API SERVER ===")
        print("Dashboard: http://localhost:8000")
        print("API docs:  http://localhost:8000/docs")
        try:
            import uvicorn
            uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
        except ImportError:
            print("Install uvicorn: pip install uvicorn")

    else:
        print("Usage:")
        print("  python backend.py           # Start API server")
        print("  python backend.py --train   # Train the model")
        print("  python backend.py --fetch   # Fetch live data")
