import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Lets the app be installed and open its own screens without a connection. Only
// in the built site: during development it would hold on to old files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // The app works the same without it; it just cannot be installed.
      });
  });
}

// An app installed while it was locked to portrait still carries that lock until
// the phone updates the installed app. In the installed app, ask the phone to
// follow its rotation setting again (needed for trailers to go fullscreen sideways).
// Browsers that do not allow this simply refuse; nothing else depends on it.
try {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    void orientation?.lock?.("any")?.catch(() => {});
  }
} catch {
  // Rotation then follows whatever the installed app was given.
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
