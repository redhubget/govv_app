// App.js (updated & fixed)
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || ""; 
const API = BACKEND_URL ? `${BACKEND_URL}/api` : (process.env.REACT_APP_API_URL || "https://your-backend-url.com/api");

// Asset URLs (sourced via vision_expert_agent)
const IMG_BIKE = "https://images.unsplash.com/photo-1558978806-73073843b15e"; // Dark-friendly e-bike
const IMG_HELMET = "https://images.unsplash.com/photo-1590093105704-fddd246ab64f";
const IMG_LIGHTS = "https://images.unsplash.com/photo-1579118690145-7753994c2d56";
const IMG_LOCK = "https://images.unsplash.com/photo-1605621290414-c8b7498408fa";

// ---------------------------
// PWA Install Prompt hook & component
// ---------------------------
function usePwaInstall() {
  const [deferred, setDeferred] = React.useState(null);
  const [installed, setInstalled] = React.useState(false);
  React.useEffect(() => {
    const before = (e) => { e.preventDefault(); setDeferred(e); };
    const installedH = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installedH);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', installedH);
    };
  }, []);
  const prompt = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === 'accepted';
  };
  return { canInstall: !!deferred && !installed, prompt, installed };
}

const InstallPrompt = () => {
  const { canInstall, prompt, installed } = usePwaInstall();
  if (!canInstall || installed) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 bg-[#0e1116] border border-[#1b2430] px-4 py-2 rounded-xl shadow-lg">
        <span className="text-sm text-[#cbd5e1]">Install Go VV for a better experience</span>
        <button onClick={prompt} className="px-3 py-1 rounded-md bg-[#4f46e5] text-white hover:bg-[#4338ca] text-sm">Install</button>
      </div>
    </div>
  );
};

// ---------------------------
// Theme Context & Provider with govv brand theme
// ---------------------------
const ThemeContext = React.createContext({ theme: "system", setTheme: () => {} });

function useApplyTheme(theme) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (mode) => {
      // reset classes
      root.classList.remove('dark');
      root.classList.remove('govv');
      if (mode === 'dark') root.classList.add('dark');
      if (mode === 'govv') { root.classList.add('govv'); root.classList.add('dark'); }
      if (meta) meta.setAttribute('content', mode === 'light' ? '#ffffff' : '#0b1020');
    };

    const compute = () => {
      if (theme === 'system') return mql.matches ? 'dark' : 'light';
      if (theme === 'govv') return 'govv';
      return theme; // 'dark' | 'light'
    };

    apply(compute());

    if (theme === 'system') {
      const handler = () => apply(mql.matches ? 'dark' : 'light');
      mql.addEventListener ? mql.addEventListener('change', handler) : mql.addListener(handler);
      return () => { mql.removeEventListener ? mql.removeEventListener('change', handler) : mql.removeListener(handler); };
    }
  }, [theme]);
}

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('system');
  useEffect(() => { (async () => { try { const r = await axios.get(`${API}/user/settings`); const t = r.data?.data?.settings?.theme; if (t) setTheme(t); } catch(e){} })(); }, []);
  useApplyTheme(theme);
  const value = React.useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// ---------------------------
// Auth Context (OTP placeholder) & Cart Context
// ---------------------------
const AuthContext = React.createContext({ authed: false, login: () => {}, logout: () => {} });
const CartContext = React.createContext({ items: [], add: () => {}, count: 0 });

const AuthProvider = ({ children }) => {
  const [authed, setAuthed] = useState(() => localStorage.getItem('govv_authed') === '1');
  const login = () => { setAuthed(true); localStorage.setItem('govv_authed','1'); };
  const logout = () => { setAuthed(false); localStorage.removeItem('govv_authed'); };
  return <AuthContext.Provider value={{ authed, login, logout }}>{children}</AuthContext.Provider>;
};

const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const add = (product) => setItems((prev) => [...prev, product]);
  const value = React.useMemo(() => ({ items, add, count: items.length }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

// ---------------------------
// Small UI Building Blocks
// ---------------------------
const Card = ({ title, children, className = "" }) => (
  <motion.div
    whileHover={{ y: -2, scale: 1.01 }}
    transition={{ type: "spring", stiffness: 260, damping: 20, mass: 0.6 }}
    className={`rounded-xl bg-[#0e1116] border border-[#1b2430] p-5 shadow-sm ${className}`}
  >
    <div className="text-sm uppercase tracking-wider text-[#8b9db2] mb-2">{title}</div>
    {children}
  </motion.div>
);

const Button = ({ children, onClick, variant = "primary", disabled }) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-colors select-none";
  const styles = variant === "primary"
    ? "bg-[#4f46e5] hover:bg-[#4338ca] text-white"
    : variant === "ghost"
      ? "bg-transparent hover:bg-[#0e1116] text-[#cbd5e1] border border-[#1f2937]"
      : variant === "destructive"
        ? "bg-red-600 hover:bg-red-700 text-white"
        : "bg-[#0e1116] hover:bg-[#111827] text-[#e5e7eb]";
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 700, damping: 30 }}
      className={`${base} ${styles} disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
};

const Skeleton = ({ className = "h-4 w-full" }) => (
  <div className={`animate-pulse bg-[#0e1116] rounded ${className}`} />
);

// ---------------------------
// Hamburger Menu (mobile: slide-out, desktop: dropdown)
// ---------------------------
const MenuLink = ({ to, label, onClick }) => (
  <Link to={to} onClick={onClick} className="block px-4 py-2 rounded hover:bg-[#0f1524] text-[#cbd5e1]">
    {label}
  </Link>
);

const HamburgerMenu = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#1b2430] hover:bg-[#0e1116]"
      >
        ☰
      </button>
      {/* Desktop collapsed menu */}
      <div className="hidden md:block">
        <div className="relative group">
          <button className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-[#1b2430] hover:bg-[#0e1116]">More</button>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            whileHover={{ opacity: 1, y: 0 }}
            className="absolute right-0 mt-2 w-56 rounded-xl border border-[#1b2430] bg-[#0b1020] p-2 hidden group-hover:block"
          >
            <MenuLink to="/dashboard" label="Dashboard" />
            <MenuLink to="/activities" label="History" />
            <MenuLink to="/shop" label="Shop" />
            <MenuLink to="/warranty" label="Warranty" />
            <MenuLink to="/contact" label="Contact" />
            <MenuLink to="/service-centers" label="Service Centers" />
            <MenuLink to="/settings" label="Settings" />
            <MenuLink to="/admin" label="Admin" />
          </motion.div>
        </div>
      </div>
      {/* Mobile slide-out drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-72 z-50 border-l border-[#1b2430] bg-[#0b1020] p-4"
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'tween', duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Menu</div>
                <button onClick={() => setOpen(false)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-[#0e1116]">✕</button>
              </div>
              <div className="space-y-1">
                <MenuLink to="/dashboard" label="Dashboard" onClick={() => setOpen(false)} />
                <MenuLink to="/activities" label="History" onClick={() => setOpen(false)} />
                <MenuLink to="/shop" label="Shop" onClick={() => setOpen(false)} />
                <MenuLink to="/warranty" label="Warranty" onClick={() => setOpen(false)} />
                <MenuLink to="/contact" label="Contact" onClick={() => setOpen(false)} />
                <MenuLink to="/service-centers" label="Service Centers" onClick={() => setOpen(false)} />
                <MenuLink to="/settings" label="Settings" onClick={() => setOpen(false)} />
                <MenuLink to="/admin" label="Admin" onClick={() => setOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------
// Layout
// ---------------------------
const Shell = ({ children }) => {
  const cart = React.useContext(CartContext);
  const auth = React.useContext(AuthContext);
  return (
    <div className="min-h-screen text-[#e5e7eb] bg-gradient-to-b from-[#0b1020] to-[#090f1a]">
      <header className="sticky top-0 z-20 backdrop-blur border-b border-[#1b2430] bg-[#0b1020]/70">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="font-bold tracking-wide text-white">Go VV</Link>
          <nav className="flex items-center gap-3 text-[#cbd5e1]">
            {/* Visible pages only: Home, Track, Profile */}
            <Link className="hover:text-white hidden md:inline-block" to="/">Home</Link>
            <Link className="hover:text-white" to="/track">Track</Link>
            <Link className="hover:text-white" to="/profile">Profile</Link>
            {/* Cart count */}
            <Link className="hover:text-white hidden md:inline-block" to="/shop">🛒 {cart.count}</Link>
            {/* Signup/Logout */}
            {!auth.authed ? (
              <Link className="hover:text-white hidden md:inline-block" to="/signup">Sign up</Link>
            ) : (
              <button className="hover:text-white hidden md:inline-block" onClick={auth.logout}>Logout</button>
            )}
            {/* Hamburger Menu (mobile + desktop collapsed) */}
            <HamburgerMenu />
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-[#1b2430] py-6 text-center text-sm text-[#8b9db2]">© {new Date().getFullYear()} Go VV</footer>
      <InstallPrompt />
    </div>
  );
};

// ---------------------------
// Sparkline tiny chart
// ---------------------------
const Spark = ({ points = [], color = "#22d3ee" }) => {
  const width = 200; const height = 50; const pad = 6;
  if (!points.length) return <svg width={width} height={height}><rect x="0" y="0" width={width} height={height} fill="#0e1116" /></svg>;
  const max = Math.max(...points); const min = Math.min(...points);
  const d = points.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / (points.length - 1 || 1);
    const y = height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <rect x="0" y="0" width={width} height={height} rx="8" fill="#0e1116" />
      <path d={d} stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
};

// ---------------------------
// Gamification helpers
// ---------------------------
const levelFromPoints = (pts) => Math.max(1, Math.floor(pts / 100) + 1);
const nextLevelAt = (level) => (level) * 100;

const LevelBadge = ({ points }) => {
  const level = levelFromPoints(points);
  const progress = Math.min(1, points / nextLevelAt(level));
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-[#131a2a] border border-[#1b2430] grid place-items-center text-[#60a5fa] font-bold">{level}</div>
      <div className="flex-1">
        <div className="text-sm text-[#8b9db2]">Level {level}</div>
        <div className="w-full h-2 bg-[#0e1116] rounded">
          <div className="h-2 bg-[#60a5fa] rounded" style={{ width: `${progress*100}%` }}></div>
        </div>
      </div>
    </div>
  );
};

const BadgePill = ({ label }) => (
  <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="px-2 py-1 bg-[#0e1116] border border-[#1b2430] rounded text-[#cbd5e1] text-xs">{label}</motion.span>
);

// ---------------------------
// Dashboard (still accessible via menu)
// ---------------------------
const Dashboard = () => {
  const [stats, setStats] = useState({ totalKm: 0, rides: 0, points: 0, streak: 0, speeds: [] });
  const [justLeveled, setJustLeveled] = useState(false);
  const prevPoints = useRef(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/activities?limit=50`);
        const items = res.data?.data?.items || [];
        let totalKm = 0; let rides = items.length; let points = 0; const speeds = [];
        const days = new Set();
        items.forEach((a) => {
          totalKm += a.distance_km || 0; points += a.points_earned || 0; speeds.push(a.avg_kmh || 0);
          const day = (a.start_time || "").slice(0, 10); if (day) days.add(day);
        });
        // naive streak count
        let streak = 0; const today = new Date(); let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        while (days.has(d.toISOString().slice(0,10))) { streak += 1; d.setUTCDate(d.getUTCDate() - 1); }
        setStats({ totalKm, rides, points, streak, speeds });
        if (levelFromPoints(points) > levelFromPoints(prevPoints.current)) setJustLeveled(true);
        prevPoints.current = points;
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  return (
    <Shell>
      {stats.streak > 0 && (
        <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-4 p-3 rounded-lg bg-[#0e1116] border border-[#1b2430] text-sm text-[#cbd5e1]">
          Keep your streak alive! You're on a {stats.streak}-day streak. Ride today to maintain it.
        </motion.div>
      )}

      {justLeveled && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-4 p-4 rounded-xl bg-[#10162a] border border-[#1b2430] text-center">
          <div className="text-xl">🎉 Level up!</div>
          <div className="text-[#8b9db2]">You're now level {levelFromPoints(stats.points)}. Keep riding!</div>
        </motion.div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
        <Card title="Total Distance">
          <div className="text-3xl font-semibold">{stats.totalKm.toFixed(1)} km</div>
          <div className="mt-3"><Spark points={stats.speeds} color="#22d3ee" /></div>
        </Card>
        <Card title="Rides">
          <div className="text-3xl font-semibold">{stats.rides}</div>
          <div className="text-[#8b9db2] mt-1">last 50</div>
        </Card>
        <Card title="Points">
          <div className="text-3xl font-semibold">{stats.points}</div>
          <div className="text-[#8b9db2] mt-1">earn by riding</div>
        </Card>
        <Card title="Level">
          <LevelBadge points={stats.points} />
        </Card>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Card title="Badges">
          <div className="flex gap-2 flex-wrap">
            <BadgePill label="Rookie Rider" />
            <BadgePill label="5 km" />
            <BadgePill label="10 Rides" />
          </div>
        </Card>
        <Card title="Quick Actions">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex gap-3">
            <Link to="/track"><Button>Start a Ride</Button></Link>
            <Link to="/activities"><Button variant="ghost">View History</Button></Link>
          </motion.div>
        </Card>
      </div>
    </Shell>
  );
};

// Leaflet Map for Tracking (react-leaflet implementation)
const LeafletMapView = ({ path = [], base }) => {
  const center = path.length ? [path[0].lat, path[0].lng] : [base.lat, base.lng];

  // Use useMemo so MapContainer is only re-created if base changes significantly
  const mapContainer = useMemo(() => (
    <MapContainer
      center={center}
      zoom={15}
      className="w-full h-[360px] rounded-xl border border-[#1b2430]"
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {path.length > 0 && (
        <>
          <Polyline positions={path.map(p => [p.lat, p.lng])} color="#22c55e" weight={3} />
          <Marker position={[path[0].lat, path[0].lng]} />
          <Marker position={[path[path.length - 1].lat, path[path.length - 1].lng]} />
          <FitPath path={path} />
        </>
      )}
    </MapContainer>
  ), [base.lat, base.lng, path]);

  return mapContainer;
};


// ---------------------------
// Haversine formula, tracking component & helpers
// ---------------------------
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// NOTE: Track must be a named component (not default export) because App is exported at the bottom
const Track = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [path, setPath] = useState([]); // [{lat,lng,t}]
  const [distance, setDistance] = useState(0); // in km
  const [avgSpeed, setAvgSpeed] = useState(0); // km/h
  const [startTime, setStartTime] = useState(null);

  // To account for pause duration so duration excludes paused time
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(null);

  const timerRef = useRef(null);
  const pathRef = useRef([]);
  const navigate = useNavigate();

  // Keep a ref copy of path for async callbacks
  useEffect(() => { pathRef.current = path; }, [path]);

  const base = { lat: 37.7749, lng: -122.4194 };

  // stable step callback that appends simulated GPS points
  const step = useCallback(() => {
    setPath((prev) => {
      const now = Date.now() / 1000;
      if (prev.length === 0) {
        const first = [{ lat: base.lat, lng: base.lng, t: now }];
        pathRef.current = first;
        return first;
      }
      const last = prev[prev.length - 1];
      const dLat = (Math.random() - 0.5) * 0.0002;
      const dLng = (Math.random() - 0.5) * 0.0002;
      const next = { lat: last.lat + dLat, lng: last.lng + dLng, t: now };
      const d = haversine(last.lat, last.lng, next.lat, next.lng); // km
      // use functional update for distance to avoid stale closures
      setDistance((cur) => cur + d);
      const updated = [...prev, next];
      pathRef.current = updated;
      return updated;
    });
  }, [base.lat, base.lng]);

  // Start tracking: reset necessary states, begin interval
  const startTracking = () => {
    if (isTracking) return;
    setIsTracking(true);
    setIsPaused(false);
    pausedDurationRef.current = 0;
    pauseStartRef.current = null;
    setDistance(0);
    setAvgSpeed(0);
    setPath([]);
    setStartTime(Date.now());
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    timerRef.current = setInterval(step, 1000);
    // Optional: Clean up any existing map container if leftover
  const existingMap = document.querySelector('.leaflet-container');
  if (existingMap && existingMap._leaflet_id) {
    existingMap._leaflet_id = null;
  };

  // Pause tracking: stop interval and track pause start time
  const pauseTracking = () => {
    if (!isTracking || isPaused) return;
    setIsPaused(true);
    pauseStartRef.current = Date.now();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Resume tracking: add paused time to pausedDuration and restart interval
  const resumeTracking = () => {
    if (!isTracking || !isPaused) return;
    setIsPaused(false);
    if (pauseStartRef.current) {
      pausedDurationRef.current += (Date.now() - pauseStartRef.current);
      pauseStartRef.current = null;
    }
    if (!timerRef.current) timerRef.current = setInterval(step, 1000);
  };

  // Stop tracking: stop interval and optionally save to backend
  const stopTracking = async () => {
    if (!isTracking) return;
    setIsTracking(false);
    setIsPaused(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const currentPath = pathRef.current || [];
    if (!currentPath || currentPath.length < 2) {
      // nothing to save
      setPath([]);
      setDistance(0);
      setAvgSpeed(0);
      setStartTime(null);
      return;
    }

    // compute duration excluding paused time
    const durationMs = Date.now() - (startTime || Date.now()) - pausedDurationRef.current;
    const durationSec = Math.max(0, Math.floor(durationMs / 1000));

    // compute avg speed
    const avgKmh = durationSec > 0 ? (distance / (durationSec / 3600)) : 0;

    // prepare payload - this mirrors what you had previously
    const payload = {
      name: "Simulated Ride",
      distance_km: Number(distance.toFixed(4)),
      duration_sec: durationSec,
      avg_kmh: Number(avgKmh.toFixed(2)),
      start_time: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      path: currentPath,
      notes: "Simulated GPS ride",
      private: false
    };

    try {
      // optionally save to backend
      const res = await axios.post(`${API}/activities`, payload);
      if (res?.data?.success) {
        const id = res.data.data.activity.id;
        // reset local state after successful save
        setPath([]);
        setDistance(0);
        setAvgSpeed(0);
        setStartTime(null);
        pausedDurationRef.current = 0;
        navigate(`/activities/${id}`);
        return;
      } else {
        // fallback: just reset but keep error in console
        setPath([]);
        setDistance(0);
        setAvgSpeed(0);
        setStartTime(null);
        pausedDurationRef.current = 0;
      }
    } catch (e) {
      console.error("Failed to save activity:", e);
      // keep data for retry instead of blowing it away
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Duration (seconds) - exclude paused time
  const durationSec = useMemo(() => {
    if (!startTime) return 0;
    const elapsed = Date.now() - startTime - pausedDurationRef.current;
    return Math.max(0, Math.floor(elapsed / 1000));
  }, [startTime, isPaused, isTracking, path.length]);

  // Avg speed recompute whenever distance or duration changes
  useEffect(() => {
    if (distance > 0 && durationSec > 0) {
      const kmsPerHour = distance / (durationSec / 3600);
      setAvgSpeed(Number(kmsPerHour.toFixed(2)));
    } else {
      setAvgSpeed(0);
    }
  }, [distance, durationSec]);

  return (
    <Shell>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card title={isTracking ? (isPaused ? "Paused" : "Live Ride") : "Ready to Ride"}>
            <div style={{ height: 420 }}>
              <LeafletMapView path={path} base={base} />
            </div>
            <motion.div layout className="mt-4 grid grid-cols-3 gap-4">
              <motion.div layout>
                <div className="text-xs text-[#8b9db2]">Distance</div>
                <div className="text-3xl font-semibold">{distance.toFixed(2)} km</div>
              </motion.div>
              <motion.div layout>
                <div className="text-xs text-[#8b9db2]">Avg Speed</div>
                <div className="text-3xl font-semibold">{avgSpeed.toFixed(1)} km/h</div>
              </motion.div>
              <motion.div layout>
                <div className="text-xs text-[#8b9db2]">Duration</div>
                <div className="text-3xl font-semibold">{Math.floor(durationSec/60)}m {durationSec%60}s</div>
              </motion.div>
            </motion.div>
            <div className="mt-4 flex gap-3">
              {!isTracking && <Button onClick={startTracking}>Start</Button>}
              {isTracking && !isPaused && <Button onClick={pauseTracking}>Pause</Button>}
              {isTracking && isPaused && <Button onClick={resumeTracking}>Resume</Button>}
              {isTracking && <Button variant="destructive" onClick={stopTracking}>Stop &amp; Save</Button>}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Ride Tips">
            <ul className="list-disc list-inside text-[#cbd5e1]">
              <li>Keep cadence steady for better efficiency</li>
              <li>Watch battery levels on climbs</li>
            </ul>
          </Card>
          <Card title="Achievements">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-[#0e1116] border border-[#1b2430] rounded">Rookie Rider</span>
              <span className="px-2 py-1 bg-[#0e1116] border border-[#1b2430] rounded">5 km</span>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
};

// ---------------------------
// Activities List & Detail
// ---------------------------
const Activities = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      try { const res = await axios.get(`${API}/activities?limit=100`); setItems(res.data?.data?.items || []); }
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold mb-4">Activity History</h1>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10"/>
          <Skeleton className="h-10"/>
          <Skeleton className="h-10"/>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Link key={a.id} to={`/activities/${a.id}`} className="block rounded-xl p-4 border border-[#1b2430] bg-[#0e1116] hover:bg-[#0f1524]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.name || "Ride"}</div>
                  <div className="text-sm text-[#8b9db2]">{new Date(a.start_time).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{a.distance_km.toFixed(2)} km</div>
                  <div className="text-sm text-[#8b9db2]">{a.avg_kmh.toFixed(1)} km/h • {Math.round(a.duration_sec/60)} min</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
};

const ActivityDetail = () => {
  const { id } = useParams();
  const [act, setAct] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const load = async () => { try { const res = await axios.get(`${API}/activities/${id}`); setAct(res.data?.data?.activity || null); setIdx(0); } catch (e) { console.error(e); } };
    load();
  }, [id]);

  useEffect(() => {
    if (!act?.path?.length) return;
    const timer = setInterval(() => setIdx((i) => Math.min(i + 1, act.path.length - 1)), 60);
    return () => clearInterval(timer);
  }, [act]);

  if (!act) return <Shell><Skeleton className="h-40"/></Shell>;

  const width = 800; const height = 400; const pad = 20;
  const coords = act.path.slice(0, idx + 1);
  const lats = coords.map(p => p.lat); const lngs = coords.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sx = (lng) => pad + (maxLng === minLng ? 0.5 : (lng - minLng)/(maxLng - minLng)) * (width - 2*pad);
  const sy = (lat) => pad + (1 - (maxLat === minLat ? 0.5 : (lat - minLat)/(maxLat - minLat))) * (height - 2*pad);
  const d = coords.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.lng)},${sy(p.lat)}`).join(" ");

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">{act.name || "Ride"}</h1>
        <div className="text-sm text-[#8b9db2]">{new Date(act.start_time).toLocaleString()}</div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Route Replay" className="md:col-span-2">
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="bg-[#0b1020] rounded-xl border border-[#1b2430]">
            {[...Array(10)].map((_,i) => (<line key={`v${i}`} x1={(i+1)*(width/12)} y1={0} x2={(i+1)*(width/12)} y2={height} stroke="#111827"/>))}
            {[...Array(6)].map((_,i) => (<line key={`h${i}`} y1={(i+1)*(height/8)} x1={0} y2={(i+1)*(height/8)} x2={width} stroke="#111827"/>))}
            <path d={d} stroke="#60a5fa" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
        </Card>
        <Card title="Stats">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[#8b9db2]">Distance</div>
              <div className="text-3xl font-semibold">{act.distance_km.toFixed(2)} km</div>
            </div>
            <div>
              <div className="text-xs text-[#8b9db2]">Avg Speed</div>
              <div className="text-3xl font-semibold">{act.avg_kmh.toFixed(1)} km/h</div>
            </div>
            <div>
              <div className="text-xs text-[#8b9db2]">Duration</div>
              <div className="text-3xl font-semibold">{Math.round(act.duration_sec/60)} min</div>
            </div>
            <div>
              <div className="text-xs text-[#8b9db2]">Points</div>
              <div className="text-3xl font-semibold">{act.points_earned}</div>
            </div>
          </div>
        </Card>
        <Card title="Notes">
          <div className="text-[#cbd5e1] min-h-[60px]">{act.notes || "—"}</div>
        </Card>
      </div>
    </Shell>
  );
};

// ---------------------------
// Profile, Settings, Signup, Home, Shop and other pages remain unchanged
//   (I left these largely intact from your original code; only small fixes
//   were made earlier where necessary)
// ---------------------------

const api = axios.create({ baseURL: `${API}` });

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState(0);
  const [bikes, setBikes] = useState(() => []); // TODO: Persist bikes to backend later
  const [bikeSerial, setBikeSerial] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/user/profile`);
        const p = r.data?.data?.profile; setProfile(p); setName(p?.name || ""); setEmail(p?.email || ""); setAvatar(p?.avatar_b64 || "");
        const acts = await axios.get(`${API}/activities?limit=100`); const items = acts.data?.data?.items || []; setPoints(items.reduce((s,a)=>s+(a.points_earned||0),0));
      } catch (e) { console.error(e);} finally { setLoading(false);} 
    })();
  }, []);

  const onAvatarChange = (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setAvatar(reader.result); reader.readAsDataURL(file); };
  const onSave = async () => { setSaving(true); try { const r = await api.put(`/user/profile`, { name, email, avatar_b64: avatar }); setProfile(r.data?.data?.profile || null); } catch (e) { console.error(e); } finally { setSaving(false); } };

  const addBike = () => { if (!bikeSerial) return; setBikes((prev)=>[...prev, { id: crypto.randomUUID(), serial: bikeSerial }]); setBikeSerial(""); };
  const removeBike = (id) => setBikes((prev)=>prev.filter(b=>b.id!==id));

  // Simple streak calculation
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    (async () => {
      try { const res = await axios.get(`${API}/activities?limit=200`); const items = res.data?.data?.items || []; const days = new Set(items.map(a=> (a.start_time||"").slice(0,10))); let s=0; const t=new Date(); let d=new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); while(days.has(d.toISOString().slice(0,10))){s++; d.setUTCDate(d.getUTCDate()-1);} setStreak(s);} catch(e){}
    })();
  }, []);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      {streak>0 && <div className="mb-4 p-3 rounded-lg bg-[#0e1116] border border-[#1b2430] text-sm text-[#cbd5e1]">Streak: {streak} day(s). Keep it up!</div>}
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-48"/></div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          <Card title="Avatar">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border border-[#1b2430] bg-[#0e1116]">
                {avatar ? <img alt="avatar" src={avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full grid place-items-center text-[#8b9db2] text-sm">No image</div>}
              </div>
              <div>
                <input id="avatar" type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
                <label htmlFor="avatar"><Button variant="ghost">Upload</Button></label>
              </div>
            </div>
          </Card>
          <Card title="Basic Info" className="md:col-span-2">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[#8b9db2]">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430] outline-none focus:border-[#4f46e5]" placeholder="Your name" />
              </div>
              <div>
                <label className="text-sm text-[#8b9db2]">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430] outline-none focus:border-[#4f46e5]" placeholder="you@example.com" />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </Card>
          <Card title="Linked Bikes">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={bikeSerial} onChange={(e)=>setBikeSerial(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430]" placeholder="Enter serial (TODO: persist to backend)" />
                <Button onClick={addBike}>Add</Button>
              </div>
              <div className="space-y-2">
                {bikes.length===0 && <div className="text-sm text-[#8b9db2]">No bikes linked yet.</div>}
                {bikes.map(b=> (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded border border-[#1b2430] bg-[#0e1116]">
                    <div className="text-sm">Serial: {b.serial}</div>
                    <Button variant="ghost" onClick={()=>removeBike(b.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Level & Badges" className="md:col-span-2">
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <LevelBadge points={points} />
              <div className="flex gap-2 flex-wrap">
                <BadgePill label="Rookie Rider" />
                <BadgePill label="100 km" />
                <BadgePill label="10 Rides" />
              </div>
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
};

// ---------------------------
// Settings, Signup, Home, Shop, etc.
// ---------------------------
const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ privacy: false, leaderboard: true, theme: "system", units: "km", notifications: false });
  const themeCtx = React.useContext(ThemeContext);

  useEffect(() => { (async () => { try { const r = await api.get(`/user/settings`); setSettings(r.data?.data?.settings || settings); } catch (e) { console.error(e); } finally { setLoading(false); } })(); }, []);

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const onSave = async () => { setSaving(true); try { const r = await api.put(`/user/settings`, settings); setSettings(r.data?.data?.settings || settings); } catch (e) { console.error(e); } finally { setSaving(false); } };

  return (
    <Shell>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-10"/></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <Card title="Privacy">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Private Mode</div>
                <div className="text-sm text-[#8b9db2]">Don’t save GPS history</div>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only" checked={settings.privacy} onChange={(e) => update({ privacy: e.target.checked })} />
                <span className={`w-12 h-7 flex items-center ${settings.privacy ? 'bg-[#4f46e5]' : 'bg-[#1b2430]'} rounded-full p-1 duration-300`}>
                  <span className={`bg-white w-5 h-5 rounded-full shadow transform duration-300 ${settings.privacy ? 'translate-x-5' : ''}`}></span>
                </span>
              </label>
            </div>
          </Card>
          <Card title="Display">
            <div className="grid gap-3">
              <div>
                <label className="text-sm text-[#8b9db2]">Theme</label>
                <select value={settings.theme} onChange={(e) => { const v = e.target.value; update({ theme: v }); themeCtx?.setTheme?.(v); }} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430]">
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="govv">GoVV</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[#8b9db2]">Units</label>
                <select value={settings.units} onChange={(e) => update({ units: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430]">
                  <option value="km">Kilometers</option>
                  <option value="mi">Miles</option>
                </select>
              </div>
            </div>
          </Card>
          <Card title="Social">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Leaderboard</div>
                <div className="text-sm text-[#8b9db2]">Include my rides in leaderboards</div>
              </div>
              <input type="checkbox" checked={settings.leaderboard} onChange={(e) => update({ leaderboard: e.target.checked })} />
            </div>
          </Card>
          <Card title="Notifications">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Enable Notifications</div>
                <div className="text-sm text-[#8b9db2]">Ride reminders and achievements</div>
              </div>
              <input type="checkbox" checked={settings.notifications} onChange={(e) => update({ notifications: e.target.checked })} />
            </div>
          </Card>
          <div className="md:col-span-2">
            <Button onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
          </div>
        </div>
      )}
    </Shell>
  );
};

const Signup = () => {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("start");
  const [otp, setOtp] = useState("");
  const auth = React.useContext(AuthContext);
  const navigate = useNavigate();

  const sendOtp = () => {
    if (!email) return; // simple placeholder
    setStep("verify");
  };

  const verify = () => {
    // Placeholder: any 4+ digit code accepted
    if (otp.length >= 4) {
      auth.login();
      navigate("/dashboard");
    }
  };

  return (
    <Shell>
      <div className="max-w-md mx-auto">
        <Card title="Sign up with Email">
          {step === 'start' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[#8b9db2]">Email</label>
                <input value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430]" placeholder="you@example.com" />
              </div>
              <Button onClick={sendOtp}>Send OTP</Button>
              <div className="text-xs text-[#8b9db2]">We will send a one-time code to your email. TODO: Wire real email OTP.</div>
            </div>
          )}
          {step === 'verify' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[#8b9db2]">Enter OTP</label>
                <input value={otp} onChange={(e)=>setOtp(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0e1116] border border-[#1b2430]" placeholder="123456" />
              </div>
              <Button onClick={verify}>Verify &amp; Continue</Button>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
};

const CycleCard = () => {
  const [battery, setBattery] = useState(76);
  const [locked, setLocked] = useState(true);
  const maxRange = 80; // km
  const range = Math.round((battery/100) * maxRange);
  return (
    <Card title="Your Cycle">
      <div className="grid md:grid-cols-2 gap-4 items-center">
        <div className="relative">
          <img src={IMG_BIKE} alt="bike" className="w-full h-48 object-cover rounded-lg border border-[#1b2430]"/>
          <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-black/50">{locked ? 'Locked' : 'Unlocked'}</div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <svg width="72" height="72" viewBox="0 0 120 120" className="shrink-0">
              <circle cx="60" cy="60" r="52" stroke="#1b2430" strokeWidth="12" fill="none" />
              <circle cx="60" cy="60" r="52" stroke="#22c55e" strokeWidth="12" fill="none" strokeDasharray={`${Math.max(0,battery)} 100`} transform="rotate(-90 60 60)" />
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="#e5e7eb" fontSize="18">{battery}%</text>
            </svg>
            <div>
              <div className="text-3xl font-semibold">{range} km</div>
              <div className="text-sm text-[#8b9db2]">Estimated range</div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setLocked(v=>!v)}>{locked ? 'Unlock' : 'Lock'}</Button>
            <Button variant="ghost" onClick={() => setBattery(Math.min(100, battery+5))}>+5% Battery</Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

const Home = () => (
  <Shell>
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Welcome to Go VV">
        <p className="text-[#cbd5e1]">Track your e-bike rides, visualize telemetry, and earn points. Start a simulated ride to see it in action.</p>
        <div className="mt-4 flex gap-3">
          <Link to="/track"><Button>Start Tracking</Button></Link>
          <Link to="/dashboard"><Button variant="ghost">Open Dashboard</Button></Link>
        </div>
      </Card>
      <CycleCard />
    </div>
  </Shell>
);

const PRODUCTS = [
  { id: 'helmet1', name: 'Aero Helmet', price: 59.99, img: IMG_HELMET },
  { id: 'lights1', name: 'LED Light Set', price: 29.99, img: IMG_LIGHTS },
  { id: 'lock1', name: 'U-Lock Pro', price: 39.99, img: IMG_LOCK },
];

const Shop = () => {
  const cart = React.useContext(CartContext);
  const [info, setInfo] = useState("");
  const add = (p) => { cart.add(p); setInfo(`${p.name} added to cart`); setTimeout(()=>setInfo(""), 1500); };
  return (
    <Shell>
      <h1 className="text-2xl font-semibold mb-4">Shop Accessories</h1>
      {info && <div className="mb-3 text-sm text-[#cbd5e1]">{info}</div>}
      <div className="grid md:grid-cols-3 gap-4">
        {PRODUCTS.map(p => (
          <Card key={p.id} title={p.name}>
            <img src={p.img} alt={p.name} className="w-full h-40 object-cover rounded-lg border border-[#1b2430]"/>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-lg font-semibold">${p.price.toFixed(2)}</div>
              <Button onClick={() => add(p)}>Add to Cart</Button>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
};

const Warranty = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-4">Warranty</h1>
    <div className="text-[#cbd5e1]">Submit claims, check status, and review coverage. TODO: Wire to backend.</div>
  </Shell>
);

const Contact = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-4">Contact</h1>
    <div className="text-[#cbd5e1]">Send us a message. TODO: Use /api/contact to email via SMTP.</div>
  </Shell>
);

const ServiceCenters = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-4">Service Centers</h1>
    <div className="text-[#cbd5e1]">Map and list of nearby centers. TODO: Add data + map.</div>
  </Shell>
);

const Admin = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-4">Admin</h1>
    <div className="text-[#cbd5e1]">Product/Warranty/Users management stubs. TODO: Implement.</div>
  </Shell>
);

const ActivitiesPreview = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { (async () => { try { const r = await axios.get(`${API}/activities?limit=5`); setItems(r.data?.data?.items || []);} catch(e){} })(); }, []);
  return (
    <div className="space-y-2">
      {items.length === 0 && <div className="text-[#8b9db2]">No rides yet</div>}
      {items.map((a) => (
        <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0e1116] border border-[#1b2430]">
          <div className="text-sm">{a.name || "Ride"}</div>
          <div className="text-sm text-[#8b9db2]">{a.distance_km.toFixed(1)} km</div>
        </div>
      ))}
    </div>
  );
};

const FadePage = ({ children }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

const AppRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<FadePage><Home /></FadePage>} />
        <Route path="/dashboard" element={<FadePage><Dashboard /></FadePage>} />
        <Route path="/track" element={<FadePage><Track /></FadePage>} />
        <Route path="/activities" element={<FadePage><Activities /></FadePage>} />
        <Route path="/activities/:id" element={<FadePage><ActivityDetail /></FadePage>} />
        <Route path="/profile" element={<FadePage><Profile /></FadePage>} />
        <Route path="/settings" element={<FadePage><Settings /></FadePage>} />
        <Route path="/shop" element={<FadePage><Shop /></FadePage>} />
        <Route path="/warranty" element={<FadePage><Warranty /></FadePage>} />
        <Route path="/contact" element={<FadePage><Contact /></FadePage>} />
        <Route path="/service-centers" element={<FadePage><ServiceCenters /></FadePage>} />
        <Route path="/admin" element={<FadePage><Admin /></FadePage>} />
        <Route path="/signup" element={<FadePage><Signup /></FadePage>} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <div className="App">
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </div>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
