import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as Window & { __ttBooted?: boolean }).__ttBooted = true;

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      /* An old WebView can reject the worker. The app still runs. */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
