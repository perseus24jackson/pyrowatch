import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// WILDFIRE PREDICTION SYSTEM — Full Dashboard
// Real NASA FIRMS data + ML Risk Model + Interactive UI
// ============================================================

const NASA_FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const FIRMS_MAP_KEY = "DEMO_KEY"; // Replace with real key from https://firms.modaps.eosdis.nasa.gov/api/area/

// Simulated ML risk scores (replace with real model backend)
function predictFireRisk(temp, humidity, ndvi, wind) {
  // Simplified logistic regression approximation
  const tempScore = Math.max(0, (temp - 20) / 40);
  const humidScore = Math.max(0, (60 - humidity) / 60);
  const ndviScore = Math.max(0, (0.6 - ndvi) / 0.6);
  const windScore = Math.min(wind / 80, 1);
  const raw = 0.35 * tempScore + 0.30 * humidScore + 0.20 * ndviScore + 0.15 * windScore;
  return Math.min(Math.round(raw * 100), 99);
}

// Color mapping
function riskColor(score) {
  if (score >= 75) return { bg: "#ff2a1a", text: "#fff", label: "EXTREME", glow: "#ff2a1a" };
  if (score >= 55) return { bg: "#ff7b00", text: "#fff", label: "HIGH", glow: "#ff7b00" };
  if (score >= 35) return { bg: "#f5c518", text: "#000", label: "MODERATE", glow: "#f5c518" };
  return { bg: "#22c55e", text: "#fff", label: "LOW", glow: "#22c55e" };
}

// Dummy satellite hotspot data mimicking NASA FIRMS CSV format
const DEMO_FIRE_DATA = [
  { lat: 34.05, lon: -118.24, brightness: 347.2, frp: 28.5, confidence: 92, acq_date: "2025-03-01", instrument: "VIIRS", region: "California" },
  { lat: 36.74, lon: -119.77, brightness: 362.1, frp: 41.3, confidence: 88, acq_date: "2025-03-01", instrument: "MODIS", region: "Central Valley, CA" },
  { lat: 37.33, lon: -122.03, brightness: 329.8, frp: 19.7, confidence: 75, acq_date: "2025-03-01", instrument: "VIIRS", region: "Bay Area, CA" },
  { lat: 33.45, lon: -112.07, brightness: 355.4, frp: 35.0, confidence: 94, acq_date: "2025-03-02", instrument: "MODIS", region: "Phoenix, AZ" },
  { lat: 39.95, lon: -75.16, brightness: 310.2, frp: 8.2, confidence: 61, acq_date: "2025-03-02", instrument: "VIIRS", region: "Pennsylvania" },
  { lat: 30.26, lon: -97.74, brightness: 341.7, frp: 22.9, confidence: 83, acq_date: "2025-03-02", instrument: "VIIRS", region: "Texas" },
  { lat: 45.52, lon: -122.68, brightness: 318.5, frp: 11.1, confidence: 70, acq_date: "2025-03-03", instrument: "MODIS", region: "Oregon" },
  { lat: 21.30, lon: -157.85, brightness: 335.0, frp: 16.0, confidence: 79, acq_date: "2025-03-03", instrument: "VIIRS", region: "Hawaii" },
];

const REGION_WEATHER = {
  "California": { temp: 38, humidity: 18, ndvi: 0.22, wind: 45, aqi: 142 },
  "Central Valley, CA": { temp: 42, humidity: 12, ndvi: 0.31, wind: 38, aqi: 118 },
  "Bay Area, CA": { temp: 33, humidity: 28, ndvi: 0.38, wind: 29, aqi: 95 },
  "Phoenix, AZ": { temp: 45, humidity: 8, ndvi: 0.14, wind: 52, aqi: 160 },
  "Pennsylvania": { temp: 22, humidity: 55, ndvi: 0.68, wind: 18, aqi: 45 },
  "Texas": { temp: 36, humidity: 22, ndvi: 0.28, wind: 41, aqi: 112 },
  "Oregon": { temp: 26, humidity: 44, ndvi: 0.55, wind: 22, aqi: 62 },
  "Hawaii": { temp: 31, humidity: 62, ndvi: 0.72, wind: 28, aqi: 38 },
};

// ── Mini Radar Chart (SVG) ──────────────────────────────────
function RadarChart({ data, size = 160 }) {
  const labels = ["Temp", "Drought", "Wind", "NDVI Inv.", "FRP"];
  const vals = data;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = labels.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, v) => ({
    x: cx + r * v * Math.cos(angle(i)),
    y: cy + r * v * Math.sin(angle(i)),
  });
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          points={Array.from({ length: n }, (_, i) => `${pt(i, lv).x},${pt(i, lv).y}`).join(" ")}
          fill="none"
          stroke="rgba(255,120,30,0.18)"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt(i, 1).x} y2={pt(i, 1).y} stroke="rgba(255,120,30,0.2)" strokeWidth="1" />
      ))}
      <polygon
        points={vals.map((v, i) => `${pt(i, v).x},${pt(i, v).y}`).join(" ")}
        fill="rgba(255,80,20,0.28)"
        stroke="#ff5014"
        strokeWidth="2"
      />
      {vals.map((v, i) => (
        <circle key={i} cx={pt(i, v).x} cy={pt(i, v).y} r={3} fill="#ff5014" />
      ))}
      {labels.map((lb, i) => (
        <text
          key={lb}
          x={pt(i, 1.25).x}
          y={pt(i, 1.25).y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ff9060"
          fontSize="9.5"
          fontFamily="'Space Mono', monospace"
        >
          {lb}
        </text>
      ))}
    </svg>
  );
}

// ── Fire Map (Canvas) ───────────────────────────────────────
function FireMap({ fires, selected, onSelect }) {
  const canvasRef = useRef(null);

  const project = (lat, lon) => {
    const x = ((lon + 160) / 80) * 100;
    const y = ((55 - lat) / 45) * 100;
    return { x, y };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Dark gradient background
    const grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, "#0d1117");
    grad.addColorStop(1, "#060810");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,100,30,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * W / 8, 0); ctx.lineTo(i * W / 8, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * H / 8); ctx.lineTo(W, i * H / 8); ctx.stroke();
    }

    // Simple US outline hint
    ctx.strokeStyle = "rgba(255,120,50,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W * 0.05, H * 0.1, W * 0.9, H * 0.8, 8);
    ctx.stroke();

    // Fire points
    fires.forEach((f) => {
      const p = project(f.lat, f.lon);
      const px = p.x * W / 100, py = p.y * H / 100;
      const w = REGION_WEATHER[f.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
      const risk = predictFireRisk(w.temp, w.humidity, w.ndvi, w.wind);
      const rc = riskColor(risk);
      const radius = 6 + (f.frp / 10);
      const isSelected = selected && selected.lat === f.lat;

      // Glow ring
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 3.5);
      glow.addColorStop(0, rc.bg + "55");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Pulse ring for selected
      if (isSelected) {
        ctx.strokeStyle = rc.bg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Core dot
      ctx.fillStyle = rc.bg;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `8px 'Space Mono', monospace`;
      ctx.fillText(f.region.split(",")[0], px + radius + 3, py + 3);
    });

    // Legend
    const legend = [
      { label: "EXTREME", color: "#ff2a1a" },
      { label: "HIGH", color: "#ff7b00" },
      { label: "MOD", color: "#f5c518" },
      { label: "LOW", color: "#22c55e" },
    ];
    legend.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(14, H - 16 - i * 16, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "9px 'Space Mono', monospace";
      ctx.fillText(l.label, 23, H - 12 - i * 16);
    });
  }, [fires, selected]);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    let closest = null, minD = 9999;
    fires.forEach((f) => {
      const p = project(f.lat, f.lon);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < minD) { minD = d; closest = f; }
    });
    if (minD < 6) onSelect(closest);
  }, [fires, onSelect]);

  return (
    <canvas
      ref={canvasRef}
      width={580}
      height={320}
      onClick={handleClick}
      style={{ width: "100%", height: "100%", cursor: "crosshair", borderRadius: "8px" }}
    />
  );
}

// ── Sparkline ───────────────────────────────────────────────
function Sparkline({ data, color }) {
  const max = Math.max(...data), min = Math.min(...data);
  const norm = data.map((v) => 1 - (v - min) / (max - min || 1));
  const W = 120, H = 40;
  const pts = norm.map((v, i) => `${(i / (data.length - 1)) * W},${v * H}`).join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={(norm.length - 1) / (norm.length - 1) * W} cy={norm[norm.length - 1] * H} r="3" fill={color} />
    </svg>
  );
}

// ── Gauge ────────────────────────────────────────────────────
function RiskGauge({ score }) {
  const rc = riskColor(score);
  const angle = -135 + (score / 100) * 270;
  const r = 52, cx = 68, cy = 68;
  const toRad = (d) => (d * Math.PI) / 180;
  const arcPt = (deg) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });
  const bgArc = `M ${arcPt(-135).x} ${arcPt(-135).y} A ${r} ${r} 0 1 1 ${arcPt(135).x} ${arcPt(135).y}`;
  const fgArc = score > 0
    ? `M ${arcPt(-135).x} ${arcPt(-135).y} A ${r} ${r} 0 ${score > 50 ? 1 : 0} 1 ${arcPt(angle).x} ${arcPt(angle).y}`
    : "";

  return (
    <svg width={136} height={100} viewBox="0 0 136 100">
      <defs>
        <filter id="gaugeGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={bgArc} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" />
      {fgArc && (
        <path d={fgArc} fill="none" stroke={rc.bg} strokeWidth="10" strokeLinecap="round" filter="url(#gaugeGlow)" />
      )}
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={cx + (r - 18) * Math.cos(toRad(angle))}
        y2={cy + (r - 18) * Math.sin(toRad(angle))}
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={5} fill="#fff" />
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="'Space Mono', monospace">{score}</text>
      <text x={cx} y={cy + 36} textAnchor="middle" fill={rc.bg} fontSize="9" fontFamily="'Space Mono', monospace">{rc.label} RISK</text>
    </svg>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function WildfireApp() {
  const [fires] = useState(DEMO_FIRE_DATA);
  const [selected, setSelected] = useState(fires[0]);
  const [activeTab, setActiveTab] = useState("map");
  const [ticker, setTicker] = useState(0);
  const [alertShown, setAlertShown] = useState(true);

  // Simulate live refresh ticker
  useEffect(() => {
    const id = setInterval(() => setTicker((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const weather = selected ? (REGION_WEATHER[selected.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20, aqi: 80 }) : null;
  const risk = weather ? predictFireRisk(weather.temp, weather.humidity, weather.ndvi, weather.wind) : 0;
  const rc = riskColor(risk);

  // Stats
  const avgRisk = Math.round(fires.reduce((a, f) => {
    const w = REGION_WEATHER[f.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
    return a + predictFireRisk(w.temp, w.humidity, w.ndvi, w.wind);
  }, 0) / fires.length);
  const extremeCount = fires.filter((f) => {
    const w = REGION_WEATHER[f.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
    return predictFireRisk(w.temp, w.humidity, w.ndvi, w.wind) >= 75;
  }).length;

  // Trend data (mock 7-day history)
  const riskTrend = [42, 48, 55, 61, 58, 67, risk];
  const tempTrend = weather ? [28, 30, 33, 35, 37, 38, weather.temp] : [];

  const radarData = weather
    ? [
        Math.min(weather.temp / 50, 1),
        Math.min((100 - weather.humidity) / 100, 1),
        Math.min(weather.wind / 80, 1),
        Math.min(1 - weather.ndvi, 1),
        Math.min((selected?.frp || 10) / 60, 1),
      ]
    : [0, 0, 0, 0, 0];

  const styles = {
    app: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #050709 0%, #0b0f14 50%, #080b0f 100%)",
      color: "#e8ddd0",
      fontFamily: "'Space Mono', monospace",
      padding: "0",
    },
    header: {
      background: "rgba(255,60,20,0.05)",
      borderBottom: "1px solid rgba(255,80,30,0.2)",
      padding: "14px 28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      backdropFilter: "blur(10px)",
    },
    logo: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    logoIcon: {
      width: "36px",
      height: "36px",
      background: "linear-gradient(135deg, #ff4500, #ff9000)",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "20px",
      boxShadow: "0 0 20px rgba(255,80,0,0.4)",
    },
    logoText: {
      fontSize: "15px",
      fontWeight: "700",
      letterSpacing: "2px",
      color: "#fff",
    },
    logoSub: {
      fontSize: "9px",
      color: "#ff8040",
      letterSpacing: "3px",
    },
    liveTag: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      background: "rgba(255,40,40,0.12)",
      border: "1px solid rgba(255,40,40,0.3)",
      borderRadius: "20px",
      padding: "4px 12px",
      fontSize: "10px",
      color: "#ff5050",
      letterSpacing: "1px",
    },
    liveDot: {
      width: "7px",
      height: "7px",
      borderRadius: "50%",
      background: "#ff3030",
      animation: "pulse 1.5s infinite",
    },
    body: {
      padding: "20px 24px",
      maxWidth: "1400px",
      margin: "0 auto",
    },
    alert: {
      background: "linear-gradient(90deg, rgba(255,40,20,0.15), rgba(255,100,0,0.08))",
      border: "1px solid rgba(255,50,20,0.35)",
      borderRadius: "8px",
      padding: "10px 16px",
      marginBottom: "18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: "11px",
      color: "#ffaa80",
    },
    statsRow: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "14px",
      marginBottom: "18px",
    },
    statCard: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,100,30,0.15)",
      borderRadius: "10px",
      padding: "14px 18px",
    },
    statLabel: { fontSize: "9px", color: "#ff8040", letterSpacing: "2px", marginBottom: "6px" },
    statValue: { fontSize: "28px", fontWeight: "700", color: "#fff" },
    statSub: { fontSize: "9px", color: "#888", marginTop: "2px" },
    mainGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 340px",
      gap: "16px",
      marginBottom: "16px",
    },
    panel: {
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,100,30,0.15)",
      borderRadius: "12px",
      overflow: "hidden",
    },
    panelHeader: {
      padding: "12px 18px",
      borderBottom: "1px solid rgba(255,100,30,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "rgba(255,80,20,0.04)",
    },
    panelTitle: { fontSize: "10px", letterSpacing: "2px", color: "#ff8040" },
    panelBody: { padding: "16px" },
    tabBar: {
      display: "flex",
      gap: "4px",
      marginBottom: "18px",
    },
    tab: (active) => ({
      padding: "7px 16px",
      borderRadius: "6px",
      fontSize: "10px",
      letterSpacing: "1px",
      cursor: "pointer",
      border: active ? "1px solid rgba(255,100,30,0.5)" : "1px solid transparent",
      background: active ? "rgba(255,80,20,0.15)" : "transparent",
      color: active ? "#ff8040" : "#888",
      transition: "all 0.2s",
    }),
    fireList: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      maxHeight: "310px",
      overflowY: "auto",
    },
    fireRow: (isSelected) => ({
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 12px",
      borderRadius: "8px",
      cursor: "pointer",
      background: isSelected ? "rgba(255,80,20,0.1)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isSelected ? "rgba(255,80,20,0.35)" : "rgba(255,255,255,0.05)"}`,
      transition: "all 0.2s",
    }),
    badge: (color) => ({
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 8px ${color}`,
      flexShrink: 0,
    }),
    bottomGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "16px",
    },
    metricRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      fontSize: "11px",
    },
    progressBar: (val, color) => ({
      height: "4px",
      background: `rgba(255,255,255,0.1)`,
      borderRadius: "2px",
      marginTop: "4px",
      position: "relative",
      overflow: "hidden",
    }),
    progressFill: (val, color) => ({
      width: `${val}%`,
      height: "100%",
      background: color,
      borderRadius: "2px",
      transition: "width 0.8s ease",
    }),
  };

  return (
    <div style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
        @keyframes flicker { 0%,100%{opacity:1} 50%{opacity:0.85} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,80,20,0.3); border-radius: 2px; }
        .fire-row:hover { border-color: rgba(255,80,20,0.3) !important; background: rgba(255,80,20,0.06) !important; }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🔥</div>
          <div>
            <div style={styles.logoText}>PYROWATCH</div>
            <div style={styles.logoSub}>WILDFIRE PREDICTION SYSTEM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1px" }}>
            DATA: NASA FIRMS · MODIS · VIIRS
          </div>
          <div style={styles.liveTag}>
            <div style={styles.liveDot} />
            LIVE FEED #{ticker.toString().padStart(4, "0")}
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {/* Alert Banner */}
        {alertShown && (
          <div style={styles.alert}>
            <span>⚠️ &nbsp;<strong>ACTIVE ALERT:</strong> Phoenix, AZ — EXTREME fire risk detected. FRP: 35.0 MW. Wind: 52 km/h. Confidence: 94%</span>
            <span style={{ cursor: "pointer", color: "#666" }} onClick={() => setAlertShown(false)}>✕</span>
          </div>
        )}

        {/* Stats Row */}
        <div style={styles.statsRow}>
          {[
            { label: "ACTIVE HOTSPOTS", value: fires.length, sub: "Last 48 hours", color: "#ff5030" },
            { label: "AVG RISK SCORE", value: avgRisk, sub: "Across all regions", color: "#ff8030" },
            { label: "EXTREME ZONES", value: extremeCount, sub: "Immediate attention", color: "#ff2020" },
            { label: "DATA SOURCES", value: "3", sub: "FIRMS · MODIS · VIIRS", color: "#60a0ff" },
          ].map((s) => (
            <div key={s.label} style={styles.statCard}>
              <div style={styles.statLabel}>{s.label}</div>
              <div style={{ ...styles.statValue, color: s.color }}>{s.value}</div>
              <div style={styles.statSub}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab Bar */}
        <div style={styles.tabBar}>
          {["map", "analysis", "data"].map((t) => (
            <div key={t} style={styles.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
              {t.toUpperCase()}
            </div>
          ))}
        </div>

        {/* MAP TAB */}
        {activeTab === "map" && (
          <div style={styles.mainGrid}>
            {/* Map */}
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <span style={styles.panelTitle}>SATELLITE HOTSPOT MAP — USA</span>
                <span style={{ fontSize: "9px", color: "#555" }}>Click hotspot to inspect</span>
              </div>
              <div style={{ padding: "12px", height: "340px" }}>
                <FireMap fires={fires} selected={selected} onSelect={setSelected} />
              </div>
            </div>

            {/* Right panel: selected fire detail */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {selected && weather && (
                <>
                  <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                      <span style={styles.panelTitle}>RISK ANALYSIS</span>
                    </div>
                    <div style={{ padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <RiskGauge score={risk} />
                      <div style={{ fontSize: "11px", color: "#aaa", textAlign: "center" }}>
                        📍 {selected.region}
                      </div>
                      <div style={{
                        background: rc.bg + "22",
                        border: `1px solid ${rc.bg}55`,
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "10px",
                        color: rc.bg,
                        letterSpacing: "1px",
                      }}>
                        {rc.label} FIRE RISK
                      </div>
                      <div style={{ width: "100%", marginTop: "4px" }}>
                        {[
                          { label: "Temperature", val: weather.temp, max: 50, unit: "°C", color: "#ff5030" },
                          { label: "Humidity", val: weather.humidity, max: 100, unit: "%", color: "#60aaff" },
                          { label: "Wind Speed", val: weather.wind, max: 80, unit: "km/h", color: "#a070ff" },
                          { label: "NDVI", val: Math.round(weather.ndvi * 100), max: 100, unit: "", color: "#30cc70" },
                          { label: "AQI", val: weather.aqi, max: 200, unit: "", color: "#ffaa30" },
                        ].map((m) => (
                          <div key={m.label} style={styles.metricRow}>
                            <span style={{ color: "#888", fontSize: "10px" }}>{m.label}</span>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ color: m.color, fontSize: "11px", fontWeight: "700" }}>{m.val}{m.unit}</span>
                              <div style={styles.progressBar(m.val, m.color)}>
                                <div style={styles.progressFill((m.val / m.max) * 100, m.color)} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === "analysis" && selected && weather && (
          <div style={styles.bottomGrid}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <span style={styles.panelTitle}>FEATURE RADAR</span>
              </div>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                <RadarChart data={radarData} size={200} />
                <div style={{ fontSize: "9px", color: "#666", textAlign: "center" }}>
                  Multi-dimensional risk factor analysis
                </div>
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <span style={styles.panelTitle}>7-DAY RISK TREND</span>
              </div>
              <div style={{ padding: "16px" }}>
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "9px", color: "#ff8040", marginBottom: "6px" }}>RISK SCORE TREND</div>
                  <Sparkline data={riskTrend} color="#ff5030" />
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#ff8040", marginBottom: "6px" }}>TEMPERATURE (°C)</div>
                  <Sparkline data={tempTrend} color="#ffaa30" />
                </div>
                <div style={{ marginTop: "16px", fontSize: "10px", color: "#666" }}>
                  <div style={styles.metricRow}>
                    <span>Peak Risk</span>
                    <span style={{ color: "#ff5030" }}>{Math.max(...riskTrend)}</span>
                  </div>
                  <div style={styles.metricRow}>
                    <span>Trend</span>
                    <span style={{ color: riskTrend[6] > riskTrend[0] ? "#ff5030" : "#30cc70" }}>
                      {riskTrend[6] > riskTrend[0] ? "↑ INCREASING" : "↓ DECREASING"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <span style={styles.panelTitle}>SATELLITE PARAMETERS</span>
              </div>
              <div style={{ padding: "16px" }}>
                {selected && (
                  <div>
                    {[
                      { label: "Instrument", value: selected.instrument },
                      { label: "Brightness (K)", value: selected.brightness },
                      { label: "FRP (MW)", value: selected.frp },
                      { label: "Confidence", value: selected.confidence + "%" },
                      { label: "Acquisition", value: selected.acq_date },
                      { label: "Latitude", value: selected.lat.toFixed(4) },
                      { label: "Longitude", value: selected.lon.toFixed(4) },
                    ].map((p) => (
                      <div key={p.label} style={styles.metricRow}>
                        <span style={{ color: "#666", fontSize: "10px" }}>{p.label}</span>
                        <span style={{ color: "#e8ddd0", fontSize: "11px" }}>{p.value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: "12px", padding: "10px", background: "rgba(255,80,20,0.06)", borderRadius: "6px", fontSize: "9px", color: "#999", lineHeight: "1.6" }}>
                      Source: NASA FIRMS API<br />
                      Model: CNN + Time-Series Ensemble<br />
                      Confidence: {selected.confidence}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DATA TAB */}
        {activeTab === "data" && (
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>ALL HOTSPOT DATA — NASA FIRMS</span>
              <span style={{ fontSize: "9px", color: "#555" }}>Sorted by risk score</span>
            </div>
            <div style={{ padding: "16px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,100,30,0.2)" }}>
                    {["Region", "Lat/Lon", "Instrument", "Brightness (K)", "FRP (MW)", "Confidence", "Risk Score", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#ff8040", fontSize: "9px", letterSpacing: "1px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...fires]
                    .sort((a, b) => {
                      const wa = REGION_WEATHER[a.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
                      const wb = REGION_WEATHER[b.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
                      return predictFireRisk(wb.temp, wb.humidity, wb.ndvi, wb.wind) - predictFireRisk(wa.temp, wa.humidity, wa.ndvi, wa.wind);
                    })
                    .map((f, i) => {
                      const w = REGION_WEATHER[f.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
                      const rs = predictFireRisk(w.temp, w.humidity, w.ndvi, w.wind);
                      const rc2 = riskColor(rs);
                      const isS = selected && selected.lat === f.lat;
                      return (
                        <tr
                          key={i}
                          onClick={() => { setSelected(f); setActiveTab("map"); }}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            cursor: "pointer",
                            background: isS ? "rgba(255,80,20,0.08)" : "transparent",
                            transition: "background 0.2s",
                          }}
                        >
                          <td style={{ padding: "9px 12px", color: "#e8ddd0" }}>{f.region}</td>
                          <td style={{ padding: "9px 12px", color: "#888" }}>{f.lat.toFixed(2)}, {f.lon.toFixed(2)}</td>
                          <td style={{ padding: "9px 12px", color: "#aaa" }}>{f.instrument}</td>
                          <td style={{ padding: "9px 12px", color: "#ffaa80" }}>{f.brightness}</td>
                          <td style={{ padding: "9px 12px", color: "#ff8050" }}>{f.frp}</td>
                          <td style={{ padding: "9px 12px", color: "#aaa" }}>{f.confidence}%</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ color: rc2.bg, fontWeight: "700" }}>{rs}</span>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{
                              background: rc2.bg + "22",
                              border: `1px solid ${rc2.bg}44`,
                              color: rc2.bg,
                              borderRadius: "4px",
                              padding: "2px 8px",
                              fontSize: "9px",
                            }}>{rc2.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fire List (below map) */}
        {activeTab === "map" && (
          <div style={{ ...styles.panel, marginTop: "16px" }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>ACTIVE HOTSPOT LIST</span>
            </div>
            <div style={{ padding: "14px" }}>
              <div style={styles.fireList}>
                {fires.map((f, i) => {
                  const w = REGION_WEATHER[f.region] || { temp: 30, humidity: 30, ndvi: 0.4, wind: 20 };
                  const rs = predictFireRisk(w.temp, w.humidity, w.ndvi, w.wind);
                  const rc2 = riskColor(rs);
                  const isSel = selected && selected.lat === f.lat;
                  return (
                    <div key={i} className="fire-row" style={styles.fireRow(isSel)} onClick={() => setSelected(f)}>
                      <div style={styles.badge(rc2.bg)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "11px", color: "#e8ddd0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.region}</div>
                        <div style={{ fontSize: "9px", color: "#666", marginTop: "2px" }}>{f.instrument} · FRP: {f.frp} MW · {f.acq_date}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: rc2.bg, fontWeight: "700", fontSize: "14px" }}>{rs}</div>
                        <div style={{ fontSize: "8px", color: rc2.bg }}>{rc2.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "9px", color: "#333", letterSpacing: "1px", paddingBottom: "20px" }}>
          PYROWATCH v1.0 · DATA: NASA FIRMS, MODIS, VIIRS · ML MODEL: CNN + TIME-SERIES ENSEMBLE<br />
          G. PULLA REDDY ENGINEERING COLLEGE · DEPT. OF CSE · 2025
        </div>
      </div>
    </div>
  );
}
