import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((reg) => {
          console.log("SW registered", reg.scope);
        })
        .catch((err) => {
          console.warn("SW registration failed", err);
        });
    });
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
