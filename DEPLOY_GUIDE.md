# PyroWatch — Complete Deployment Guide

## What You Have

```
pyrowatch-ultimate/
├── web/
│   ├── index.html      ← Full 3D app (Three.js)
│   └── vercel.json     ← Vercel deployment config
└── unity/
    └── Scripts/        ← Unity C# scripts (from earlier)
```

---

## PART 1 — Deploy to Vercel (Live URL in 5 minutes)

### Step 1 — Push web folder to GitHub

```bash
cd pyrowatch-ultimate/web
git init
git add .
git commit -m "PyroWatch 3D Earth Intelligence System"
git remote add origin https://github.com/perseus24jackson/pyrowatch-web.git
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to **vercel.com** → Sign in with GitHub
2. Click **Add New → Project**
3. Select your `pyrowatch-web` repository
4. Click **Deploy**
5. Done! Your live URL: `https://pyrowatch-web.vercel.app`

### Step 3 — Custom domain (optional)

In Vercel dashboard → Domains → Add `pyrowatch.yourname.com`

---

## PART 2 — What the 3D App Does

### Solar System View
- 8 planets orbiting the sun with correct distances and tilt
- Saturn rings, Jupiter bands
- 15,000 stars with color variation (blue giants, red dwarfs, white)
- Milky Way band
- Animated sun with surface shader
- Bloom/glow post-processing via UnrealBloomPass

### Earth View
- Photorealistic vertex-colored Earth (land/ocean differentiation)
- Atmospheric glow layer
- Cloud layer rotating independently
- 4 satellites orbiting with trails:
  - MODIS/VIIRS (NASA FIRMS fire data)
  - ISS (408 km)
  - Landsat 9 (705 km)
  - Sentinel-2 (786 km)
- Fire hotspot markers with pulsing rings at real GPS coordinates

### Navigation
- Click any planet to view it
- Type coordinates or click quick-coords to fly to location
- Earth rotates to face selected coordinate
- Camera smoothly flies to terrain view
- Drag to orbit, scroll to zoom, touch support

### Weather VFX (all particle-based)
- **Wildfire**: 2000 fire particles with temperature gradient shader
  (deep red → orange → yellow-white), smoke layer
- **Thunderstorm**: Rain particles + lightning bolt with random flash
- **Blizzard**: Snow particles with sine-wave drift
- **Flood**: Animated water plane with wave displacement
- **Clear**: Removes all effects

### Risk Analysis Panel
- Animated arc gauge with needle sweep
- Live metrics: Temperature, Humidity, Wind, NDVI, FRP, AQI
- Risk classification: LOW / MODERATE / HIGH / EXTREME
- Extreme alert banner

---

## PART 3 — Add Real Data (API Keys)

### NASA FIRMS (Real fire hotspots)
```
https://firms.modaps.eosdis.nasa.gov/api/area/
→ Get free MAP_KEY
→ Replace FIRE_DATA array with API fetch
```

### OpenWeatherMap (Real weather)
```
https://openweathermap.org/api
→ Free 1000 calls/day
→ Replace updateWeatherPanel() with API call
```

### Real satellite positions (TLE data)
```
https://celestrak.com/SOCRATES/
→ Free TLE orbital elements
→ Use satellite.js library to compute real positions
```

---

## PART 4 — Unity Integration

The Unity scripts (from earlier files) connect to the same FastAPI backend.
Run both simultaneously:
- Web app at vercel.app (for browser/mobile)
- Unity app locally (for desktop presentation)

Both share the same `/fires` API endpoint.

---

## PART 5 — Presentation Checklist

Before your review:
- [ ] Open `https://your-app.vercel.app` in Chrome
- [ ] Press F11 for fullscreen
- [ ] Click SOLAR SYSTEM → watch planets orbit
- [ ] Click EARTH VIEW → see satellites and fire hotspots
- [ ] Click "Phoenix AZ" quick coord → Earth rotates to Arizona
- [ ] Set weather to WILDFIRE → see fire particles
- [ ] Switch to THUNDERSTORM → lightning effect
- [ ] Show the risk gauge and metrics panel
- [ ] Click TERRAIN for close-up view
- [ ] Show minimap with all global hotspots

---

*PyroWatch · G. Pulla Reddy Engineering College · CSE · 2025*
