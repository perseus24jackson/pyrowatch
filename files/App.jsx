import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   PYROWATCH 2.0 — Immersive Full-Screen Wildfire Dashboard
   Aesthetic: Cinematic mission-control / military ops center
   Features: Animated particle fire, real-time canvas map,
             animated gauges, glassmorphism panels, pulse rings
   ============================================================ */

// ── Data ────────────────────────────────────────────────────
const FIRES = [
  { id:1, lat:33.45, lon:-112.07, region:"Phoenix, AZ",       frp:35.0, brightness:355.4, confidence:94, instrument:"VIIRS",  temp:45, humidity:8,  ndvi:0.14, wind:52, aqi:160 },
  { id:2, lat:36.74, lon:-119.77, region:"Central Valley, CA",frp:41.3, brightness:362.1, confidence:88, instrument:"MODIS",  temp:42, humidity:12, ndvi:0.31, wind:38, aqi:118 },
  { id:3, lat:34.05, lon:-118.24, region:"Los Angeles, CA",   frp:28.5, brightness:347.2, confidence:92, instrument:"VIIRS",  temp:38, humidity:18, ndvi:0.22, wind:45, aqi:142 },
  { id:4, lat:30.26, lon:-97.74,  region:"Austin, TX",        frp:22.9, brightness:341.7, confidence:83, instrument:"VIIRS",  temp:36, humidity:22, ndvi:0.28, wind:41, aqi:112 },
  { id:5, lat:37.33, lon:-122.03, region:"Bay Area, CA",      frp:19.7, brightness:329.8, confidence:75, instrument:"MODIS",  temp:33, humidity:28, ndvi:0.38, wind:29, aqi:95  },
  { id:6, lat:45.52, lon:-122.68, region:"Portland, OR",      frp:11.1, brightness:318.5, confidence:70, instrument:"MODIS",  temp:26, humidity:44, ndvi:0.55, wind:22, aqi:62  },
  { id:7, lat:39.95, lon:-75.16,  region:"Philadelphia, PA",  frp:8.2,  brightness:310.2, confidence:61, instrument:"VIIRS",  temp:22, humidity:55, ndvi:0.68, wind:18, aqi:45  },
  { id:8, lat:21.30, lon:-157.85, region:"Honolulu, HI",      frp:16.0, brightness:335.0, confidence:79, instrument:"VIIRS",  temp:31, humidity:62, ndvi:0.72, wind:28, aqi:38  },
];

function calcRisk(f) {
  const t = Math.max(0,(f.temp-20)/40);
  const h = Math.max(0,(60-f.humidity)/60);
  const n = Math.max(0,(0.6-f.ndvi)/0.6);
  const w = Math.min(f.wind/80,1);
  const frpS = Math.min(f.frp/60,1);
  return Math.min(Math.round((0.28*t+0.25*h+0.18*n+0.14*w+0.15*frpS)*100),99);
}

function riskMeta(s) {
  if(s>=75) return { label:"EXTREME", color:"#ff1a0a", glow:"rgba(255,26,10,0.6)",  ring:"rgba(255,26,10,0.25)"  };
  if(s>=55) return { label:"HIGH",    color:"#ff6600", glow:"rgba(255,102,0,0.55)", ring:"rgba(255,102,0,0.2)"   };
  if(s>=35) return { label:"MODERATE",color:"#f5c518", glow:"rgba(245,197,24,0.5)", ring:"rgba(245,197,24,0.18)" };
  return           { label:"LOW",     color:"#22c55e", glow:"rgba(34,197,94,0.4)",  ring:"rgba(34,197,94,0.15)"  };
}

const FIRES_WITH_RISK = FIRES.map(f => ({ ...f, risk: calcRisk(f), meta: riskMeta(calcRisk(f)) }))
  .sort((a,b) => b.risk - a.risk);

// ── Particle Fire Effect ────────────────────────────────────
function useParticles(canvasRef, active) {
  const particles = useRef([]);
  const raf = useRef(null);

  const spawnParticle = useCallback((x, y, color) => {
    particles.current.push({
      x, y,
      vx: (Math.random()-0.5)*1.2,
      vy: -Math.random()*2.5-1,
      life: 1,
      decay: 0.012+Math.random()*0.018,
      size: Math.random()*4+2,
      color,
    });
  }, []);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const animate = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      particles.current = particles.current.filter(p => p.life > 0);
      particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.04;
        p.life -= p.decay;
        p.size *= 0.98;
        const alpha = Math.max(0, p.life);
        ctx.globalAlpha = alpha * 0.85;
        const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
        g.addColorStop(0, p.color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(raf.current);
  }, [active, canvasRef]);

  return spawnParticle;
}

// ── Animated Arc Gauge ──────────────────────────────────────
function ArcGauge({ score, size=220 }) {
  const [display, setDisplay] = useState(0);
  const meta = riskMeta(score);
  useEffect(() => {
    let cur = 0;
    const step = score / 60;
    const id = setInterval(() => {
      cur = Math.min(cur + step, score);
      setDisplay(Math.round(cur));
      if (cur >= score) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [score]);

  const r = size*0.38, cx=size/2, cy=size/2+10;
  const toRad = d => d*Math.PI/180;
  const arc = (deg) => ({ x: cx+r*Math.cos(toRad(deg)), y: cy+r*Math.sin(toRad(deg)) });
  const pct = display/100;
  const endAngle = -135 + pct*270;
  const largeArc = pct > 0.5 ? 1 : 0;
  const start = arc(-135), end = arc(endAngle);

  return (
    <svg width={size} height={size} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f5c518"/>
          <stop offset="50%" stopColor="#ff6600"/>
          <stop offset="100%" stopColor="#ff1a0a"/>
        </linearGradient>
        <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path
        d={`M ${arc(-135).x} ${arc(-135).y} A ${r} ${r} 0 1 1 ${arc(135).x} ${arc(135).y}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round"
      />
      {/* Fill */}
      {display > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round"
          filter="url(#gaugeGlow)"
        />
      )}
      {/* Tick marks */}
      {[0,25,50,75,100].map(t => {
        const a = -135 + t*2.7;
        const inner = arc_pt(cx, cy, r-18, a);
        const outer = arc_pt(cx, cy, r-8, a);
        return <line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
          stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>;
      })}
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={cx+(r-20)*Math.cos(toRad(endAngle))}
        y2={cy+(r-20)*Math.sin(toRad(endAngle))}
        stroke="white" strokeWidth="2.5" strokeLinecap="round"
        style={{transition:"all 0.05s"}}
      />
      <circle cx={cx} cy={cy} r={7} fill="#1a1a2e" stroke="white" strokeWidth="2"/>
      {/* Score */}
      <text x={cx} y={cy+30} textAnchor="middle" fill="white"
        fontSize={size*0.18} fontWeight="800" fontFamily="'Orbitron',monospace">{display}</text>
      <text x={cx} y={cy+52} textAnchor="middle" fill={meta.color}
        fontSize="11" fontFamily="'Orbitron',monospace" letterSpacing="2">{meta.label}</text>
    </svg>
  );
}

function arc_pt(cx,cy,r,deg) {
  return { x: cx+r*Math.cos(deg*Math.PI/180), y: cy+r*Math.sin(deg*Math.PI/180) };
}

// ── Animated Bar ────────────────────────────────────────────
function AnimBar({ value, max, color, label, unit="" }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW((value/max)*100), 100);
    return () => clearTimeout(t);
  }, [value, max]);
  return (
    <div style={{marginBottom:"10px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px",fontSize:"10px"}}>
        <span style={{color:"#888",letterSpacing:"1px"}}>{label}</span>
        <span style={{color,fontWeight:"700",fontFamily:"'Orbitron',monospace"}}>{value}{unit}</span>
      </div>
      <div style={{height:"3px",background:"rgba(255,255,255,0.07)",borderRadius:"2px",overflow:"hidden"}}>
        <div style={{
          width:`${w}%`, height:"100%", background:color,
          borderRadius:"2px", transition:"width 1.2s cubic-bezier(0.4,0,0.2,1)",
          boxShadow:`0 0 8px ${color}`
        }}/>
      </div>
    </div>
  );
}

// ── Radar Chart ─────────────────────────────────────────────
function Radar({ fire, size=200 }) {
  const labels = ["TEMP","DROUGHT","WIND","DRY VEG","FRP"];
  const raw = [
    Math.min((fire.temp-15)/40,1),
    Math.min((100-fire.humidity)/95,1),
    Math.min(fire.wind/75,1),
    Math.min(1-fire.ndvi,1),
    Math.min(fire.frp/55,1),
  ];
  const [vals, setVals] = useState([0,0,0,0,0]);
  useEffect(() => {
    const t = setTimeout(() => setVals(raw), 200);
    return () => clearTimeout(t);
  }, [fire.id]);

  const n=5, cx=size/2, cy=size/2, r=size*0.35;
  const angle = i => -Math.PI/2 + (Math.PI*2*i)/n;
  const pt = (i,v) => ({ x: cx+r*v*Math.cos(angle(i)), y: cy+r*v*Math.sin(angle(i)) });

  return (
    <svg width={size} height={size} style={{overflow:"visible"}}>
      <defs>
        <radialGradient id="radarFill">
          <stop offset="0%" stopColor="#ff4400" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#ff0000" stopOpacity="0.1"/>
        </radialGradient>
      </defs>
      {[0.25,0.5,0.75,1].map(lv=>(
        <polygon key={lv}
          points={Array.from({length:n},(_,i)=>`${pt(i,lv).x},${pt(i,lv).y}`).join(" ")}
          fill="none" stroke={`rgba(255,100,30,${lv*0.15})`} strokeWidth="1"/>
      ))}
      {Array.from({length:n},(_,i)=>(
        <line key={i} x1={cx} y1={cy} x2={pt(i,1).x} y2={pt(i,1).y}
          stroke="rgba(255,100,30,0.15)" strokeWidth="1"/>
      ))}
      <polygon
        points={vals.map((v,i)=>`${pt(i,v).x},${pt(i,v).y}`).join(" ")}
        fill="url(#radarFill)"
        stroke="#ff4400" strokeWidth="2"
        style={{transition:"all 0.8s ease"}}
      />
      {vals.map((v,i)=>(
        <circle key={i} cx={pt(i,v).x} cy={pt(i,v).y} r="3.5" fill="#ff4400"
          style={{filter:"drop-shadow(0 0 4px #ff4400)"}}/>
      ))}
      {labels.map((lb,i)=>{
        const p = pt(i,1.3);
        return <text key={lb} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          fill="#ff9060" fontSize="9" fontFamily="'Orbitron',monospace">{lb}</text>;
      })}
    </svg>
  );
}

// ── Main Map Canvas ─────────────────────────────────────────
function FireMapCanvas({ fires, selected, onSelect }) {
  const canvasRef = useRef(null);
  const particleCanvas = useRef(null);
  const spawnParticle = useParticles(particleCanvas, true);
  const animRef = useRef(null);
  const pulseRef = useRef(0);

  // Projection: lon/lat → canvas x/y (US-centric)
  const project = (lat,lon,W,H) => ({
    x: ((lon+160)/85)*W,
    y: ((53-lat)/38)*H,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const pCanvas = particleCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W=canvas.width, H=canvas.height;

    const render = (ts) => {
      pulseRef.current = ts;
      ctx.clearRect(0,0,W,H);

      // Background
      const bg = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.7);
      bg.addColorStop(0,"#0a0d14");
      bg.addColorStop(1,"#050709");
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

      // Grid
      ctx.strokeStyle="rgba(255,80,20,0.04)"; ctx.lineWidth=1;
      for(let i=0;i<=12;i++){
        ctx.beginPath(); ctx.moveTo(i*W/12,0); ctx.lineTo(i*W/12,H); ctx.stroke();
      }
      for(let i=0;i<=8;i++){
        ctx.beginPath(); ctx.moveTo(0,i*H/8); ctx.lineTo(W,i*H/8); ctx.stroke();
      }

      // Scanline effect
      for(let y=0;y<H;y+=4){
        ctx.fillStyle="rgba(0,0,0,0.03)";
        ctx.fillRect(0,y,W,2);
      }

      // Connection lines between high-risk fires
      const highRisk = fires.filter(f=>f.risk>=55);
      highRisk.forEach((f,i) => {
        if(i===0) return;
        const a = project(f.lat,f.lon,W,H);
        const b = project(highRisk[i-1].lat,highRisk[i-1].lon,W,H);
        const pulse = (Math.sin(ts*0.002+i)*0.5+0.5)*0.15;
        ctx.strokeStyle=`rgba(255,80,20,${pulse})`;
        ctx.lineWidth=1; ctx.setLineDash([4,8]);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Fire points
      fires.forEach(f => {
        const {x,y} = project(f.lat,f.lon,W,H);
        const radius = 5 + (f.frp/10);
        const isSel = selected && selected.id===f.id;
        const pulse = Math.sin(ts*0.003+f.id)*0.5+0.5;

        // Outer glow rings (animated)
        [3,2,1].forEach(ring => {
          const rSize = radius*(1+ring*0.7+pulse*ring*0.3);
          const alpha = (0.12/ring)*(isSel?2:1);
          const g = ctx.createRadialGradient(x,y,0,x,y,rSize);
          g.addColorStop(0, f.meta.color+"44");
          g.addColorStop(1, "transparent");
          ctx.fillStyle=g;
          ctx.beginPath(); ctx.arc(x,y,rSize,0,Math.PI*2); ctx.fill();
        });

        // Selected ring
        if(isSel){
          ctx.strokeStyle=f.meta.color;
          ctx.lineWidth=2;
          ctx.setLineDash([5,3]);
          ctx.beginPath(); ctx.arc(x,y,radius+12+pulse*4,0,Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Core
        const coreGrad = ctx.createRadialGradient(x-radius*0.3,y-radius*0.3,0,x,y,radius);
        coreGrad.addColorStop(0,"#fff8");
        coreGrad.addColorStop(0.4, f.meta.color);
        coreGrad.addColorStop(1, f.meta.color+"aa");
        ctx.fillStyle=coreGrad;
        ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();

        // Spawn particles for extreme fires
        if(f.risk>=75 && Math.random()<0.4){
          spawnParticle(x+Math.random()*radius*2-radius, y, f.meta.color);
        }

        // Label
        ctx.font=`bold 9px 'Orbitron', monospace`;
        ctx.fillStyle="rgba(255,255,255,0.9)";
        ctx.fillText(f.region.split(",")[0], x+radius+5, y-3);
        ctx.font=`8px monospace`;
        ctx.fillStyle="rgba(255,160,80,0.7)";
        ctx.fillText(`${f.risk}`, x+radius+5, y+8);
      });

      // Legend
      const legend=[{l:"EXTREME",c:"#ff1a0a"},{l:"HIGH",c:"#ff6600"},{l:"MOD",c:"#f5c518"},{l:"LOW",c:"#22c55e"}];
      legend.forEach((l,i)=>{
        const lx=16, ly=H-20-i*18;
        const lg=ctx.createRadialGradient(lx,ly,0,lx,ly,6);
        lg.addColorStop(0,"#fff6"); lg.addColorStop(0.5,l.c); lg.addColorStop(1,l.c+"44");
        ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(lx,ly,5,0,Math.PI*2); ctx.fill();
        ctx.font="9px 'Orbitron',monospace"; ctx.fillStyle="rgba(255,255,255,0.6)";
        ctx.fillText(l.l, lx+10, ly+3);
      });

      // Coords display
      ctx.font="9px 'Courier New',monospace"; ctx.fillStyle="rgba(255,100,30,0.3)";
      ctx.fillText(`LAT: 24.5°–49.5°N  LON: 125°–67°W`, W-220, H-10);

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [fires, selected, spawnParticle]);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX-rect.left)/rect.width)*canvas.width;
    const my = ((e.clientY-rect.top)/rect.height)*canvas.height;
    let closest=null, minD=9999;
    fires.forEach(f => {
      const {x,y}=({x:((f.lon+160)/85)*canvas.width, y:((53-f.lat)/38)*canvas.height});
      const d=Math.hypot(x-mx,y-my);
      if(d<minD){minD=d;closest=f;}
    });
    if(minD<40) onSelect(closest);
  },[fires,onSelect]);

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={canvasRef} width={900} height={440}
        onClick={handleClick}
        style={{width:"100%",height:"100%",cursor:"crosshair",borderRadius:"8px",display:"block"}}/>
      <canvas ref={particleCanvas} width={900} height={440}
        style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",borderRadius:"8px"}}/>
    </div>
  );
}

// ── Sparkline with fill ──────────────────────────────────────
function Spark({ data, color, label, unit="" }) {
  const max=Math.max(...data), min=Math.min(...data);
  const norm=data.map(v=>1-(v-min)/(max-min||1));
  const W=160,H=48;
  const pts=norm.map((v,i)=>`${(i/(data.length-1))*W},${v*(H-4)+2}`).join(" ");
  const fillPts=`0,${H} ${pts} ${W},${H}`;
  return (
    <div>
      <div style={{fontSize:"9px",color:"#666",letterSpacing:"2px",marginBottom:"4px",fontFamily:"'Orbitron',monospace"}}>{label}</div>
      <svg width={W} height={H} style={{overflow:"visible"}}>
        <defs>
          <linearGradient id={`sf${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#sf${label})`}/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx={(norm.length-1)/(norm.length-1)*W} cy={norm[norm.length-1]*(H-4)+2} r="3" fill={color}
          style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
      </svg>
      <div style={{fontSize:"11px",color,fontFamily:"'Orbitron',monospace",marginTop:"2px",fontWeight:"700"}}>
        {data[data.length-1]}{unit}
      </div>
    </div>
  );
}

// ── Glass Panel ─────────────────────────────────────────────
function Panel({ children, style={}, className="" }) {
  return (
    <div className={className} style={{
      background:"rgba(255,255,255,0.025)",
      backdropFilter:"blur(12px)",
      border:"1px solid rgba(255,100,30,0.15)",
      borderRadius:"12px",
      overflow:"hidden",
      ...style
    }}>{children}</div>
  );
}

function PanelHead({ title, right }) {
  return (
    <div style={{
      padding:"10px 16px",
      borderBottom:"1px solid rgba(255,100,30,0.1)",
      display:"flex",alignItems:"center",justifyContent:"space-between",
      background:"rgba(255,80,20,0.04)",
    }}>
      <span style={{fontSize:"9px",letterSpacing:"3px",color:"#ff8040",fontFamily:"'Orbitron',monospace"}}>{title}</span>
      {right && <span style={{fontSize:"9px",color:"#444"}}>{right}</span>}
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────
export default function App() {
  const [selected, setSelected] = useState(FIRES_WITH_RISK[0]);
  const [tab, setTab] = useState("map");
  const [tick, setTick] = useState(0);
  const [alerts, setAlerts] = useState(
    FIRES_WITH_RISK.filter(f=>f.risk>=75).map(f=>({ id:f.id, text:`${f.region} — EXTREME risk (${f.risk}). FRP: ${f.frp} MW`, dismissed:false }))
  );
  const [time, setTime] = useState(new Date());

  useEffect(()=>{ const id=setInterval(()=>setTick(t=>t+1),3500); return()=>clearInterval(id); },[]);
  useEffect(()=>{ const id=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(id); },[]);

  const riskTrend = [42,48,55,61,58,67,selected.risk];
  const tempTrend = [28,30,33,35,37,38,selected.temp];
  const frpTrend  = [12,18,22,25,20,28,selected.frp];
  const extremes  = FIRES_WITH_RISK.filter(f=>f.risk>=75).length;
  const avgRisk   = Math.round(FIRES_WITH_RISK.reduce((a,f)=>a+f.risk,0)/FIRES_WITH_RISK.length);
  const activeAlerts = alerts.filter(a=>!a.dismissed);

  return (
    <div style={{
      width:"100vw", height:"100vh",
      background:"#050709",
      color:"#e8ddd0",
      fontFamily:"'Rajdhani',sans-serif",
      display:"flex", flexDirection:"column",
      overflow:"hidden",
      position:"relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,80,20,0.4);border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.4)}}
        @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        .tab-btn:hover{background:rgba(255,80,20,0.12)!important;color:#ff8040!important;}
        .fire-row:hover{background:rgba(255,80,20,0.08)!important;border-color:rgba(255,80,20,0.3)!important;}
        .stat-card{transition:transform 0.2s,box-shadow 0.2s;}
        .stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(255,80,20,0.12)!important;}
      `}</style>

      {/* Scan line overlay */}
      <div style={{
        position:"fixed",top:0,left:0,right:0,bottom:0,
        background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.015) 3px,rgba(0,0,0,0.015) 4px)",
        pointerEvents:"none",zIndex:100,
      }}/>

      {/* ── HEADER ── */}
      <div style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 24px", height:"56px", flexShrink:0,
        background:"rgba(5,7,9,0.95)",
        borderBottom:"1px solid rgba(255,80,30,0.2)",
        backdropFilter:"blur(20px)",
        zIndex:10,
      }}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{
            width:"38px",height:"38px",borderRadius:"8px",
            background:"linear-gradient(135deg,#ff4500,#ff9000)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"20px",boxShadow:"0 0 24px rgba(255,80,0,0.5)",
          }}>🔥</div>
          <div>
            <div style={{fontSize:"17px",fontWeight:"900",letterSpacing:"4px",color:"#fff",fontFamily:"'Orbitron',monospace"}}>PYROWATCH</div>
            <div style={{fontSize:"8px",color:"#ff8040",letterSpacing:"4px",fontFamily:"'Orbitron',monospace"}}>WILDFIRE PREDICTION SYSTEM</div>
          </div>
        </div>

        {/* Center nav */}
        <div style={{display:"flex",gap:"4px"}}>
          {["map","analysis","data"].map(t=>(
            <button key={t} className="tab-btn" onClick={()=>setTab(t)} style={{
              padding:"7px 20px", borderRadius:"6px", border:"none", cursor:"pointer",
              background: tab===t ? "rgba(255,80,20,0.2)" : "transparent",
              color: tab===t ? "#ff8040" : "#666",
              fontSize:"10px",letterSpacing:"2px",fontFamily:"'Orbitron',monospace",
              borderBottom: tab===t ? "2px solid #ff8040" : "2px solid transparent",
              transition:"all 0.2s",
            }}>{t.toUpperCase()}</button>
          ))}
        </div>

        {/* Right info */}
        <div style={{display:"flex",alignItems:"center",gap:"20px",fontSize:"10px"}}>
          <div style={{color:"#444",fontFamily:"'Orbitron',monospace",letterSpacing:"1px"}}>
            {time.toUTCString().slice(0,25)} UTC
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",
            background:"rgba(255,40,40,0.1)",border:"1px solid rgba(255,40,40,0.3)",
            borderRadius:"20px",padding:"4px 14px",color:"#ff5050",
            fontFamily:"'Orbitron',monospace",letterSpacing:"1px",
          }}>
            <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"#ff3030",animation:"pulse 1.5s infinite"}}/>
            LIVE · #{String(tick).padStart(4,"0")}
          </div>
        </div>
      </div>

      {/* ── ALERT BANNER ── */}
      {activeAlerts.length > 0 && (
        <div style={{
          background:"linear-gradient(90deg,rgba(255,30,10,0.12),rgba(255,80,0,0.06),transparent)",
          borderBottom:"1px solid rgba(255,50,20,0.25)",
          padding:"7px 24px",flexShrink:0,
          display:"flex",gap:"12px",overflowX:"auto",alignItems:"center",
          animation:"fadeIn 0.3s ease",
        }}>
          <span style={{fontSize:"9px",color:"#ff4020",letterSpacing:"2px",fontFamily:"'Orbitron',monospace",flexShrink:0}}>⚠ ALERTS</span>
          {activeAlerts.map(a=>(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:"10px",
              background:"rgba(255,40,10,0.08)",border:"1px solid rgba(255,40,10,0.2)",
              borderRadius:"4px",padding:"3px 10px",flexShrink:0,
            }}>
              <span style={{fontSize:"10px",color:"#ffaa80"}}>{a.text}</span>
              <span onClick={()=>setAlerts(al=>al.map(x=>x.id===a.id?{...x,dismissed:true}:x))}
                style={{cursor:"pointer",color:"#555",fontSize:"11px",marginLeft:"4px"}}>✕</span>
            </div>
          ))}
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",padding:"14px 20px",gap:"12px"}}>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",flexShrink:0}}>
          {[
            { label:"ACTIVE HOTSPOTS", value:FIRES_WITH_RISK.length, sub:"Last 48 hrs", color:"#ff8040" },
            { label:"EXTREME ZONES",   value:extremes, sub:"Immediate danger", color:"#ff1a0a" },
            { label:"AVG RISK SCORE",  value:avgRisk,  sub:"All regions",      color:"#ff6600" },
            { label:"MAX FRP (MW)",    value:Math.max(...FIRES_WITH_RISK.map(f=>f.frp)), sub:"Fire radiative power", color:"#f5c518" },
            { label:"DATA SOURCES",   value:"3",  sub:"FIRMS · MODIS · VIIRS", color:"#60aaff" },
          ].map(s=>(
            <Panel key={s.label} className="stat-card" style={{padding:"12px 16px"}}>
              <div style={{fontSize:"8px",color:"#ff8040",letterSpacing:"2px",marginBottom:"6px",fontFamily:"'Orbitron',monospace"}}>{s.label}</div>
              <div style={{fontSize:"30px",fontWeight:"900",color:s.color,fontFamily:"'Orbitron',monospace",lineHeight:1,
                textShadow:`0 0 20px ${s.color}66`}}>{s.value}</div>
              <div style={{fontSize:"10px",color:"#555",marginTop:"4px"}}>{s.sub}</div>
            </Panel>
          ))}
        </div>

        {/* ── MAP TAB ── */}
        {tab==="map" && (
          <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 320px",gap:"12px",minHeight:0}}>
            {/* Map */}
            <div style={{display:"flex",flexDirection:"column",gap:"12px",minHeight:0}}>
              <Panel style={{flex:1,minHeight:0}}>
                <PanelHead title="SATELLITE HOTSPOT MAP — CONTIGUOUS USA" right="Click hotspot to inspect"/>
                <div style={{padding:"10px",height:"calc(100% - 40px)"}}>
                  <FireMapCanvas fires={FIRES_WITH_RISK} selected={selected} onSelect={setSelected}/>
                </div>
              </Panel>
            </div>

            {/* Right panel */}
            <div style={{display:"flex",flexDirection:"column",gap:"12px",minHeight:0,overflowY:"auto"}}>
              {/* Gauge */}
              <Panel>
                <PanelHead title="RISK ANALYSIS"/>
                <div style={{padding:"14px",display:"flex",flexDirection:"column",alignItems:"center",gap:"6px"}}>
                  <ArcGauge score={selected.risk} size={200}/>
                  <div style={{fontSize:"12px",color:"#aaa",textAlign:"center"}}>📍 {selected.region}</div>
                  <div style={{
                    background:selected.meta.color+"22",border:`1px solid ${selected.meta.color}44`,
                    borderRadius:"6px",padding:"4px 16px",fontSize:"9px",
                    color:selected.meta.color,letterSpacing:"2px",fontFamily:"'Orbitron',monospace",
                  }}>{selected.meta.label} FIRE RISK</div>
                </div>
              </Panel>

              {/* Metrics */}
              <Panel>
                <PanelHead title="ENVIRONMENTAL DATA"/>
                <div style={{padding:"14px"}}>
                  <AnimBar value={selected.temp}     max={50}  color="#ff5030" label="TEMPERATURE" unit="°C"/>
                  <AnimBar value={selected.humidity}  max={100} color="#60aaff" label="HUMIDITY"    unit="%"/>
                  <AnimBar value={selected.wind}      max={80}  color="#a070ff" label="WIND SPEED"  unit="km/h"/>
                  <AnimBar value={Math.round(selected.ndvi*100)} max={100} color="#30cc70" label="NDVI INDEX" unit=""/>
                  <AnimBar value={selected.aqi}       max={200} color="#ffaa30" label="AIR QUALITY" unit=""/>
                </div>
              </Panel>

              {/* Satellite params */}
              <Panel>
                <PanelHead title="SATELLITE DATA"/>
                <div style={{padding:"12px"}}>
                  {[
                    ["INSTRUMENT", selected.instrument],
                    ["BRIGHTNESS", `${selected.brightness} K`],
                    ["FRP",        `${selected.frp} MW`],
                    ["CONFIDENCE", `${selected.confidence}%`],
                    ["LAT / LON",  `${selected.lat}° / ${selected.lon}°`],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",
                      padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:"11px"}}>
                      <span style={{color:"#555",letterSpacing:"1px",fontFamily:"'Orbitron',monospace",fontSize:"9px"}}>{k}</span>
                      <span style={{color:"#e8ddd0",fontWeight:"600"}}>{v}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ── ANALYSIS TAB ── */}
        {tab==="analysis" && (
          <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",minHeight:0,overflowY:"auto"}}>
            <Panel>
              <PanelHead title="RISK FACTOR RADAR"/>
              <div style={{padding:"16px",display:"flex",flexDirection:"column",alignItems:"center",gap:"10px"}}>
                <Radar fire={selected} size={220}/>
                <div style={{fontSize:"10px",color:"#555",textAlign:"center",letterSpacing:"1px"}}>
                  {selected.region}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",width:"100%",marginTop:"4px"}}>
                  {[
                    {l:"Temp Score",    v:Math.round(Math.min((selected.temp-15)/40,1)*100)},
                    {l:"Drought",       v:Math.round(Math.min((100-selected.humidity)/95,1)*100)},
                    {l:"Wind Factor",   v:Math.round(Math.min(selected.wind/75,1)*100)},
                    {l:"Dry Veg",       v:Math.round(Math.min(1-selected.ndvi,1)*100)},
                  ].map(({l,v})=>(
                    <div key={l} style={{background:"rgba(255,80,20,0.06)",borderRadius:"6px",padding:"8px",textAlign:"center"}}>
                      <div style={{fontSize:"18px",fontWeight:"700",color:"#ff6030",fontFamily:"'Orbitron',monospace"}}>{v}</div>
                      <div style={{fontSize:"9px",color:"#666",marginTop:"2px"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="7-DAY TREND"/>
              <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:"24px"}}>
                <Spark data={riskTrend} color="#ff5030" label="RISK SCORE" unit=""/>
                <Spark data={tempTrend} color="#ffaa30" label="TEMPERATURE" unit="°C"/>
                <Spark data={frpTrend}  color="#ff3080" label="FRP (MW)"    unit=""/>
                <div style={{marginTop:"4px",fontSize:"10px",color:"#555"}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <span>Trend Direction</span>
                    <span style={{color:riskTrend[6]>riskTrend[0]?"#ff5030":"#22c55e",fontFamily:"'Orbitron',monospace",fontSize:"9px"}}>
                      {riskTrend[6]>riskTrend[0]?"↑ ESCALATING":"↓ DECLINING"}
                    </span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                    <span>7-Day Peak</span>
                    <span style={{color:"#ff8040",fontFamily:"'Orbitron',monospace",fontSize:"9px"}}>{Math.max(...riskTrend)}</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="ALL REGIONS RANKING"/>
              <div style={{padding:"12px",overflowY:"auto",maxHeight:"calc(100% - 40px)"}}>
                {FIRES_WITH_RISK.map((f,i)=>(
                  <div key={f.id} className="fire-row"
                    onClick={()=>{setSelected(f);setTab("map");}}
                    style={{
                      display:"flex",alignItems:"center",gap:"10px",padding:"9px 10px",
                      borderRadius:"8px",cursor:"pointer",marginBottom:"6px",
                      background: selected.id===f.id ? "rgba(255,80,20,0.1)" : "rgba(255,255,255,0.02)",
                      border:`1px solid ${selected.id===f.id ? "rgba(255,80,20,0.3)" : "rgba(255,255,255,0.05)"}`,
                      transition:"all 0.2s",
                    }}>
                    <div style={{fontSize:"10px",color:"#444",fontFamily:"'Orbitron',monospace",width:"16px"}}>{i+1}</div>
                    <div style={{width:"8px",height:"8px",borderRadius:"50%",background:f.meta.color,
                      boxShadow:`0 0 8px ${f.meta.color}`,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"11px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.region}</div>
                      <div style={{fontSize:"9px",color:"#555",marginTop:"1px"}}>{f.instrument} · FRP {f.frp} MW</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"15px",fontWeight:"700",color:f.meta.color,fontFamily:"'Orbitron',monospace"}}>{f.risk}</div>
                      <div style={{fontSize:"8px",color:f.meta.color}}>{f.meta.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* ── DATA TAB ── */}
        {tab==="data" && (
          <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
            <Panel style={{height:"100%"}}>
              <PanelHead title="RAW SATELLITE DATA — NASA FIRMS" right={`${FIRES_WITH_RISK.length} RECORDS`}/>
              <div style={{padding:"14px",overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid rgba(255,100,30,0.2)"}}>
                      {["#","Region","Lat","Lon","Instrument","Brightness (K)","FRP (MW)","Confidence","Temp °C","Humidity","Wind","NDVI","AQI","Risk","Status"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"8px 12px",
                          color:"#ff8040",fontSize:"8px",letterSpacing:"2px",
                          fontFamily:"'Orbitron',monospace",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FIRES_WITH_RISK.map((f,i)=>(
                      <tr key={f.id} onClick={()=>{setSelected(f);setTab("map");}}
                        style={{
                          borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",
                          background:selected.id===f.id?"rgba(255,80,20,0.06)":"transparent",
                          transition:"background 0.2s",
                        }}>
                        {[
                          i+1, f.region,
                          f.lat.toFixed(2), f.lon.toFixed(2),
                          f.instrument, f.brightness, f.frp,
                          `${f.confidence}%`, f.temp, `${f.humidity}%`,
                          `${f.wind} km/h`, f.ndvi.toFixed(2), f.aqi,
                        ].map((v,j)=>(
                          <td key={j} style={{padding:"9px 12px",color:j===1?"#e8ddd0":"#888",whiteSpace:"nowrap"}}>{v}</td>
                        ))}
                        <td style={{padding:"9px 12px"}}><span style={{fontSize:"13px",fontWeight:"700",color:f.meta.color,fontFamily:"'Orbitron',monospace"}}>{f.risk}</span></td>
                        <td style={{padding:"9px 12px"}}>
                          <span style={{background:f.meta.color+"22",border:`1px solid ${f.meta.color}44`,
                            color:f.meta.color,borderRadius:"4px",padding:"2px 8px",
                            fontSize:"8px",fontFamily:"'Orbitron',monospace",whiteSpace:"nowrap"}}>{f.meta.label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        height:"26px",flexShrink:0,borderTop:"1px solid rgba(255,80,20,0.1)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 20px",background:"rgba(5,7,9,0.9)",
        fontSize:"8px",color:"#333",letterSpacing:"2px",fontFamily:"'Orbitron',monospace",
      }}>
        <span>PYROWATCH v2.0 · G. PULLA REDDY ENGINEERING COLLEGE · CSE DEPT · 2025</span>
        <span>DATA: NASA FIRMS · MODIS · VIIRS · MODEL: CNN + TIME-SERIES ENSEMBLE</span>
        <span style={{animation:"blink 2s infinite"}}>● SYSTEM NOMINAL</span>
      </div>
    </div>
  );
}
