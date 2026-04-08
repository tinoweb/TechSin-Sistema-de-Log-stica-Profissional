import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register Service Worker for offline PWA support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = import.meta.env.BASE_URL + "sw.js";
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
