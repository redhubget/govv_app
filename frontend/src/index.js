import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // Tailwind + custom styles
import App from "./App";
import { BrowserRouter } from "react-router-dom";

/**
 * Registers the service worker for PWA capabilities.
 * Only runs if the browser supports it.
 */
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((reg) => {
          console.log("Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
    });
  }
}

// Create React root (React 18+)
const root = ReactDOM.createRoot(document.getElementById("root"));

// Render the App with React Router
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Initialize service worker
registerServiceWorker();
