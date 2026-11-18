import { Capacitor } from "@capacitor/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as Window & { __ttBooted?: boolean }).__ttBooted = true;

/* The Android bundle ships a worker that only unregisters itself. Never register it. */
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(base + "sw.js").catch(function () {
      /* An old WebView can reject the worker. The app still runs. */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
