import React, { useEffect, useMemo, useRef, useState } from "react";
/* PWA Install Prompt hook & component */
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


import "./App.css";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
// Layout
// ---------------------------
const Shell = ({ children }) => {
  return (
    <div className="min-h-screen text-[#e5e7eb] bg-gradient-to-b from-[#0b1020] to-[#090f1a]">
      <header className="sticky top-0 z-20 backdrop-blur border-b border-[#1b2430] bg-[#0b1020]/70">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <InstallPrompt />

          <Link to="/" className="font-bold tracking-wide text-white">Go VV</Link>
          <nav className="flex items-center gap-4 text-[#cbd5e1]">
            <Link className="hover:text-white" to="/dashboard">Dashboard</Link>
            <Link className="hover:text-white" to="/track">Track</Link>
            <Link className="hover:text-white" to="/activities">History</Link>
            <Link className="hover:text-white" to="/profile">Profile</Link>
            <Link className="hover:text-white" to="/settings">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-[#1b2430] py-6 text-center text-sm text-[#8b9db2]">© {new Date().getFullYear()} Go VV</footer>
    </div>
  );
};

// ---------------------------
// Dashboard (cards + tiny charts)
// ---------------------------
const Spark = ({ points = [], color = "#22d3ee" }) => {
  // points: [numbers]
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

// Route transition wrapper
const FadePage = ({ children }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalKm: 0,
    rides: 0,
    points: 0,
    streak: 0,
    speeds: [],
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/activities?limit=50`);
        const items = res.data?.data?.items || [];
        let totalKm = 0; let rides = items.length; let points = 0; let streak = 0; const speeds = [];
        const days = new Set();
        items.forEach((a) => {
          totalKm += a.distance_km || 0; points += a.points_earned || 0; speeds.push(a.avg_kmh || 0);
          const day = (a.start_time || "").slice(0, 10); if (day) days.add(day);
        });
        // naive streak: count consecutive unique days from today backward
        const today = new Date();
        let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        while (days.has(d.toISOString().slice(0,10))) {
          streak += 1; d.setUTCDate(d.getUTCDate() - 1);
        }
        setStats({ totalKm, rides, points, streak, speeds });
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  return (
    <Shell>
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
        <Card title="Streak">
          <div className="text-3xl font-semibold">{stats.streak} days</div>
          <div className="text-[#8b9db2] mt-1">keep going!</div>
        </Card>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Card title="Quick Actions">
          <div className="flex gap-3">
            <Link to="/track"><Button>Start a Ride</Button></Link>
            <Link to="/activities"><Button variant="ghost">View History</Button></Link>
          </div>
        </Card>
        <Card title="Tips">
          <ul className="list-disc list-inside text-[#cbd5e1]">
            <li>Long-press Pause to add a note mid-ride</li>
            <li>Turn on Privacy in Settings to disable GPS saving</li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
};

// ---------------------------
// Tracking (simulated GPS + polyline + metrics)
// ---------------------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const Track = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [path, setPath] = useState([]); // [{lat,lng,t}]
  const [distance, setDistance] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const durationSec = useMemo(() => startTime ? Math.floor((Date.now() - startTime)/1000) : 0, [startTime, path.length, isPaused, isTracking]);

  const base = { lat: 37.7749, lng: -122.4194 };

  const step = () => {
    setPath((prev) => {
      if (prev.length === 0) {
        return [{ lat: base.lat, lng: base.lng, t: Date.now()/1000 }];
      }
      const last = prev[prev.length - 1];
      // small random move (~5-20 meters)
      const dLat = (Math.random() - 0.5) * 0.0002;
      const dLng = (Math.random() - 0.5) * 0.0002;
      const next = { lat: last.lat + dLat, lng: last.lng + dLng, t: Date.now()/1000 };
      const d = haversine(last.lat, last.lng, next.lat, next.lng);
      setDistance((x) => x + d);
      return [...prev, next];
    });
  };

  useEffect(() => {
    if (isTracking && !isPaused) {
      timerRef.current = setInterval(step, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTracking, isPaused]);

  useEffect(() => {
    if (!isTracking) { setPath([]); setDistance(0); setAvgSpeed(0); setStartTime(null); }
  }, [isTracking]);

  useEffect(() => {
    if (durationSec > 0) {
      setAvgSpeed((distance / durationSec) * 3600); // km/h
    }
  }, [distance, durationSec]);

  const onStart = () => { setIsTracking(true); setIsPaused(false); setStartTime(Date.now()); };
  const onPause = () => setIsPaused((p) => !p);
  const onStop = async () => {
    setIsTracking(false);
    if (path.length < 2) return;
    try {
      const payload = {
        name: "Simulated Ride",
        distance_km: distance,
        duration_sec: durationSec,
        avg_kmh: avgSpeed,
        start_time: new Date(startTime).toISOString(),
        path,
        notes: "Simulated GPS ride",
        private: false,
      };
      const res = await axios.post(`${API}/activities`, payload);
      if (res.data?.success) {
        const id = res.data.data.activity.id;
        navigate(`/activities/${id}`);
      }
    } catch (e) { console.error(e); }
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex gap-3"
          >
            <Link to="/track"><Button>Start a Ride</Button></Link>
            <Link to="/activities"><Button variant="ghost">View History</Button></Link>
          </motion.div>

  };

  // simple grid map + polyline drawing
  const Map = () => {
    const width = 600; const height = 360; const pad = 20;
    const coords = path.length ? path : [{ lat: base.lat, lng: base.lng }];
    const lats = coords.map(p => p.lat); const lngs = coords.map(p => p.lng);
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
    const scaleX = (lng) => pad + (maxLng === minLng ? 0.5 : (lng - minLng)/(maxLng - minLng)) * (width - 2*pad);
    const scaleY = (lat) => pad + (1 - (maxLat === minLat ? 0.5 : (lat - minLat)/(maxLat - minLat))) * (height - 2*pad);
    const d = coords.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.lng)},${scaleY(p.lat)}`).join(" ");
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="bg-[#0b1020] rounded-xl border border-[#1b2430]">
        {/* grid */}
        {[...Array(10)].map((_,i) => (
          <line key={`v${i}`} x1={(i+1)*(width/12)} y1={0} x2={(i+1)*(width/12)} y2={height} stroke="#111827"/>
        ))}
        {[...Array(6)].map((_,i) => (
          <line key={`h${i}`} y1={(i+1)*(height/8)} x1={0} y2={(i+1)*(height/8)} x2={width} stroke="#111827"/>
        ))}
        {/* path */}
        <path d={d} stroke="#22c55e" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      </svg>
    );
  };

  return (
    <Shell>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card title={isTracking ? (isPaused ? "Paused" : "Live Ride") : "Ready to Ride"}>
            <Map />
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-[#8b9db2]">Distance</div>
                <div className="text-3xl font-semibold">{distance.toFixed(2)} km</div>
              </div>
              <div>
                <div className="text-xs text-[#8b9db2]">Avg Speed</div>
                <div className="text-3xl font-semibold">{avgSpeed.toFixed(1)} km/h</div>
              </div>
              <div>
                <div className="text-xs text-[#8b9db2]">Duration</div>
                <div className="text-3xl font-semibold">{Math.floor(durationSec/60)}m {durationSec%60}s</div>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              {!isTracking && <Button onClick={onStart}>Start</Button>}
              {isTracking && <Button onClick={onPause}>{isPaused ? "Resume" : "Pause"}</Button>}
              {isTracking && <Button variant="ghost" onClick={onStop}>Stop &amp; Save</Button>}
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
            <div className="mt-4 flex gap-3">
              {!isTracking && <Button onClick={onStart}>Start</Button>}
              {isTracking && <Button onClick={onPause}>{isPaused ? "Resume" : "Pause"}</Button>}
              {isTracking && <Button variant="ghost" onClick={onStop}>Stop & Save</Button>}
            </div>

              </motion.div>
            </motion.div>

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
    const load = async () => {
      try { const res = await axios.get(`${API}/activities/${id}`); setAct(res.data?.data?.activity || null); setIdx(0); }
      catch (e) { console.error(e); }
    };
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
            {[...Array(10)].map((_,i) => (
              <line key={`v${i}`} x1={(i+1)*(width/12)} y1={0} x2={(i+1)*(width/12)} y2={height} stroke="#111827"/>
            ))}
            {[...Array(6)].map((_,i) => (
              <line key={`h${i}`} y1={(i+1)*(height/8)} x1={0} y2={(i+1)*(height/8)} x2={width} stroke="#111827"/>
            ))}
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

const Profile = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-2">Profile</h1>
    <div className="text-[#8b9db2]">Edit info, avatar, linked bikes — Coming soon.</div>
  </Shell>
);

const Settings = () => (
  <Shell>
    <h1 className="text-2xl font-semibold mb-2">Settings</h1>
    <div className="text-[#8b9db2]">Privacy toggle, theme, leaderboard — Coming soon.</div>
  </Shell>
);

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
      <Card title="Recent Activity">
        <ActivitiesPreview />
      </Card>
    </div>
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

// ---------------------------
// Routes Component
// ---------------------------
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
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <div className="App">
      <AppRoutes />
    </div>
  );
}

export default App;