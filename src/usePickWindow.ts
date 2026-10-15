import { useEffect, useState } from "react";

// A short pause after a spin lands, so the carousel settles on the pick before
// the window opens.
const OPEN_DELAY_MS = 900;

// Opens the window shortly after each spin picks a movie; closing it keeps the
// pick highlighted, and show() reopens it. `waiting` is true during the pause.
export const usePickWindow = (selectedId: string | null) => {
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    setOpen(false);
    if (!selectedId) {
      setWaiting(false);
      return;
    }
    setWaiting(true);
    const timer = window.setTimeout(() => {
      setWaiting(false);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [selectedId]);
  return { open, waiting, show: () => setOpen(true), close: () => setOpen(false) };
};
