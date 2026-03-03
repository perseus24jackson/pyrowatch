# 🔥 PYROWATCH — Wildfire Prediction System
## Complete Implementation Guide

> **Project**: Wild Fire Prediction using Satellite Imaging  
> **College**: G. Pulla Reddy Engineering College (Autonomous), Kurnool  
> **Dept**: Computer Science and Engineering  

---

## 📐 ARCHITECTURE OVERVIEW

```
NASA FIRMS API (Satellite)
    │
    ▼
Data Ingestion Layer        ← Python scripts fetch MODIS/VIIRS CSV data
    │
    ▼
Feature Engineering         ← Brightness, FRP, NDVI, Weather, Drought Index
    │
    ▼
ML Model (CNN + MLP)        ← Trained PyTorch model predicts risk score 0–100
    │
    ▼
FastAPI Backend             ← REST API serves predictions to frontend
    │
    ▼
React Dashboard             ← Interactive map, charts, hotspot list
```

---

## 🧰 FULL TECH STACK

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React + Tailwind | Interactive dashboard |
| **Visualization** | HTML Canvas, SVG | Map, radar chart, gauge |
| **Backend** | FastAPI (Python) | REST API server |
| **ML Framework** | PyTorch | CNN model training + inference |
| **Data Science** | NumPy, Pandas, scikit-learn | Feature engineering |
| **Satellite Data** | NASA FIRMS API | Real-time fire hotspots |
| **Weather Data** | OpenWeatherMap API | Temperature, humidity, wind |
| **Image Processing** | rasterio, Pillow | GeoTIFF satellite processing |
| **Database** | SQLite / PostgreSQL | Store predictions + history |
| **Caching** | In-memory / Redis | API response caching |
| **Deployment** | Uvicorn + Nginx | Production server |

---

## 🚀 STEP-BY-STEP IMPLEMENTATION

---

### PHASE 1: Environment Setup (Day 1)

#### 1.1 Create Python Virtual Environment
```bash
python -m venv wildfire_env
source wildfire_env/bin/activate       # Linux/Mac
wildfire_env\Scripts\activate          # Windows

pip install fastapi uvicorn torch torchvision scikit-learn \
            rasterio pillow numpy pandas requests aiohttp \
            python-dotenv redis sqlalchemy pydantic
```

#### 1.2 Create .env file
```env
NASA_FIRMS_KEY=your_key_here
OPENWEATHER_KEY=your_key_here
```

#### 1.3 Get Free API Keys

**NASA FIRMS (Most important):**
1. Go to: https://firms.modaps.eosdis.nasa.gov/api/area/
2. Click "Get MAP_KEY" — free, instant
3. Returns real-time satellite fire CSV data
4. Covers: MODIS Terra, MODIS Aqua, VIIRS S-NPP, VIIRS NOAA-20

**OpenWeatherMap (Weather data):**
1. Go to: https://openweathermap.org/api
2. Sign up → API keys → Copy key
3. 1000 free calls/day on free tier

---

### PHASE 2: Backend Development (Day 2–4)

#### 2.1 Project Folder Structure
```
wildfire/
├── backend/
│   ├── backend.py          ← Main API + ML model (provided)
│   ├── requirements.txt
│   └── .env
├── frontend/
│   └── WildfireDashboard.jsx  ← React dashboard (provided)
├── models/
│   └── wildfire_cnn.pt      ← Saved PyTorch model
├── data/
│   ├── firms_cache/         ← Cached satellite CSV files
│   └── training/            ← Training datasets
└── notebooks/
    └── exploration.ipynb    ← EDA and model development
```

#### 2.2 Start the API Server
```bash
cd wildfire/backend
python backend.py --server
# OR:
uvicorn backend:app --reload --host 0.0.0.0 --port 8000
```

**Verify it works:**
```
http://localhost:8000/         ← Health check
http://localhost:8000/docs     ← Swagger API docs (auto-generated!)
http://localhost:8000/fires    ← Live fire hotspots
http://localhost:8000/stats    ← Risk statistics
```

#### 2.3 Train the ML Model
```bash
python backend.py --train
# Creates: models/wildfire_cnn.pt
```

#### 2.4 Fetch Live Data
```bash
python backend.py --fetch
# Prints live hotspot table
```

---

### PHASE 3: Real Satellite Data Deep Dive (Day 3–5)

#### 3.1 NASA FIRMS — How It Works

The FIRMS API returns CSV data like this:
```csv
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,
instrument,confidence,version,bright_t31,frp,daynight
34.0562,-118.2437,326.3,1.0,1.0,2025-03-01,0140,N,VIIRS,n,2.0NRT,295.2,8.5,N
```

**Key columns explained:**
- `brightness` — Land Surface Temperature in Kelvin (>330K = fire likely)
- `frp` — Fire Radiative Power in Megawatts (higher = more intense)
- `confidence` — l(ow)/n(ominal)/h(igh) for VIIRS, 0–100% for MODIS

**Fetch specific area (USA):**
```python
# W,S,E,N format
area = "-125.0,24.5,-66.5,49.5"
url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/1/{area}"
```

#### 3.2 Adding Real NDVI (Google Earth Engine)

For real vegetation index data, install and authenticate Earth Engine:
```bash
pip install earthengine-api
earthengine authenticate
```

```python
import ee
ee.Initialize()

def get_ndvi(lat, lon, date_str):
    point = ee.Geometry.Point([lon, lat])
    collection = (ee.ImageCollection("MODIS/006/MOD13A2")
                  .filterDate(date_str, "2025-12-31")
                  .filterBounds(point))
    ndvi = collection.first().select("NDVI").reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=point,
        scale=500
    ).get("NDVI")
    return ee.Number(ndvi).multiply(0.0001).getInfo()  # Scale factor
```

#### 3.3 Adding Real Satellite Image Processing

Download and process actual GeoTIFF satellite images:
```bash
pip install rasterio earthaccess
```

```python
import rasterio
import numpy as np

def process_landsat_patch(geotiff_path, lat, lon, patch_size=64):
    """Extract a 64x64 multi-band patch around a fire point."""
    with rasterio.open(geotiff_path) as src:
        # Get pixel coordinates
        row, col = src.index(lon, lat)
        half = patch_size // 2
        
        # Read bands: Red (4), NIR (5), SWIR1 (6), Thermal (10)
        window = rasterio.windows.Window(
            col - half, row - half, patch_size, patch_size
        )
        patch = src.read([4, 5, 6, 10], window=window).astype(np.float32)
        
        # Normalize to 0–1
        patch = (patch - patch.min()) / (patch.max() - patch.min() + 1e-8)
        return patch  # Shape: (4, 64, 64)
```

---

### PHASE 4: Frontend Setup (Day 4)

#### 4.1 Create React App
```bash
npx create-react-app wildfire-dashboard
cd wildfire-dashboard
# Replace src/App.js content with WildfireDashboard.jsx
```

#### 4.2 Connect to Real Backend API

Add this to your React component (replace demo data):
```javascript
const [fires, setFires] = useState([]);

useEffect(() => {
  fetch("http://localhost:8000/fires?days=1&source=VIIRS_SNPP")
    .then(res => res.json())
    .then(data => setFires(data.fires))
    .catch(err => console.error("API error:", err));
}, []);
```

#### 4.3 Run Frontend
```bash
npm start
# Opens at http://localhost:3000
```

---

### PHASE 5: CNN Architecture for Images (Day 5–7)

The `SatelliteCNN` in backend.py processes 4-band satellite images:

```
Input: (B, 4, 64, 64)         ← Batch of 64×64 patches, 4 bands
    ↓
Conv2d(4→32) + BN + ReLU      ← Extract low-level spatial features
MaxPool2d(2)                  ← 32×32
    ↓
Conv2d(32→64) + BN + ReLU
MaxPool2d(2)                  ← 16×16
    ↓
Conv2d(64→128) + BN + ReLU
MaxPool2d(2)                  ← 8×8
    ↓
Conv2d(128→256) + BN + ReLU
AdaptiveAvgPool2d(1)          ← Global average pooling → (B, 256)
    ↓
FC(256→128) + ReLU + Dropout(0.3)
FC(128→1) + Sigmoid × 100     ← Risk score 0–100
```

**Bands used:**
- Band 1: Red (vegetation stress)
- Band 2: Near-Infrared (vegetation density)
- Band 3: SWIR (soil moisture, burn scars)
- Band 4: Thermal (land surface temperature)

---

### PHASE 6: Time-Series Component (Day 6–8)

Add LSTM for temporal patterns:
```python
import torch.nn as nn

class TimeSeriesRiskLSTM(nn.Module):
    """
    Analyzes 30-day history of fire conditions.
    Input: (B, 30, 12) — 30 days of 12 features each
    Output: risk probability for next 7 days
    """
    def __init__(self, input_size=12, hidden_size=64, num_layers=2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 7),   # Predict next 7 days
            nn.Sigmoid()
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :]) * 100
```

---

### PHASE 7: Deployment (Day 9–10)

#### Local Production Build
```bash
# Backend
pip install gunicorn
gunicorn backend:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Frontend
npm run build
# Serves from build/ folder via any static server
```

#### Docker Deployment
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t pyrowatch .
docker run -p 8000:8000 --env-file .env pyrowatch
```

---

## 📊 MODEL EVALUATION METRICS

| Metric | Target | Description |
|---|---|---|
| **Accuracy** | >85% | Overall classification correctness |
| **Precision** | >80% | Of predicted fires, how many were real |
| **Recall** | >90% | Of real fires, how many were detected |
| **F1-Score** | >85% | Harmonic mean of precision and recall |
| **AUC-ROC** | >0.90 | Area under ROC curve |
| **MAE** | <8 pts | Mean absolute error of risk score |

---

## 🔑 KEY FILES SUMMARY

| File | Purpose |
|---|---|
| `backend/backend.py` | Complete Python backend (data + ML + API) |
| `frontend/WildfireDashboard.jsx` | React dashboard (map + charts + table) |

---

## 📚 REFERENCES & DATA SOURCES

1. **NASA FIRMS API** — https://firms.modaps.eosdis.nasa.gov/api/area/
2. **MODIS Fire Products** — https://modis.gsfc.nasa.gov/data/dataprod/mod14.php
3. **VIIRS Active Fire** — https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/viirs-i-band-375-m-active-fire-data
4. **Google Earth Engine** — https://earthengine.google.com/
5. **OpenWeatherMap API** — https://openweathermap.org/api
6. **Global Fire Atlas** — https://www.globalfiredata.org/
7. **CAL FIRE Dataset** — https://www.fire.ca.gov/incidents/

---

*PyroWatch v1.0 · G. Pulla Reddy Engineering College · CSE Dept · 2025*
