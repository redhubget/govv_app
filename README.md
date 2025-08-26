# Go VV – PWA (Frontend)

A Progressive Web App for electric bicycle tracking built with React, TailwindCSS, Framer Motion, and Leaflet + OpenStreetMap.

Visible pages (always in header)
- Home: cycle image, battery %, remaining range, lock/unlock, quick actions
- Track: GPS tracking with Leaflet + OSM (API-free), live polyline (mock data)
- Profile: editable name/email/avatar, linked bikes (stub), gamification (badges, levels, streak)

Other pages via Hamburger Menu
- Dashboard, History, Shop, Warranty, Contact, Service Centers, Settings, Admin (stubs where noted)
- Mobile: slide-out drawer. Desktop: collapsed dropdown.

Setup (dev)
1) Frontend env (do not change backend URL in code)
- frontend/.env already has:
  - REACT_APP_BACKEND_URL=<your-backend-url> (provided by platform)
- Optional: PWA works out-of-the-box, no config needed
- Leaflet + OpenStreetMap works without API keys

2) Start/Build
- Use yarn only (platform uses supervisor to run services)
- Hot reload is enabled; no manual server starts needed

3) Leaflet Integration
- We use react-leaflet + OpenStreetMap tiles
- No API keys required
- Map code is in Track page (LeafletMapView component), auto fits route bounds

4) Theme Switching
- Settings → Theme: System, Dark, Light, GoVV
- Applied globally via ThemeProvider
- Updates <html> classes and meta theme-color

5) Signup (OTP placeholder)
- /signup: Enter email → Send OTP (placeholder) → Enter code → Verify
- TODO: Wire actual OTP endpoints; use /api/contact or dedicated /api/auth/send-otp and /api/auth/verify-otp later

6) Gamification
- Points from rides drive Levels; badges displayed on Dashboard/Profile
- Streak reminder shown when riding on consecutive days

7) Contact Email (backend note)
- Backend has a placeholder SMTP that tries EMAIL_USER/EMAIL_PASS and falls back to demo values
- TODO: Replace with real Gmail App Password in backend/.env and restart backend

8) Notes
- All API calls use REACT_APP_BACKEND_URL + "/api"
- UUIDs are used by backend; datetimes are ISO strings
- This repo focuses on the frontend – backend endpoints are under /api

File map (key files)
- frontend/src/App.js: all pages/components for MVP (highly commented)
- frontend/public/manifest.json, service-worker.js: PWA assets
- Tailwind utilities in frontend/src/index.css

Troubleshooting
- If maps don’t show: ensure leaflet CSS loaded; we import 'leaflet/dist/leaflet.css' in App.js
- If theme isn’t applied: verify Settings theme selection and that html has class dark/govv when expected

License
- Images are from Unsplash/Pexels and used for demo purposes