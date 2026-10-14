import { useEffect, useState } from "react";

// Opens the window each time a spin picks a movie; closing it keeps the pick
// highlighted, and show() reopens it.
export const usePickWindow = (selectedId: string | null) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(Boolean(selectedId));
  }, [selectedId]);
  return { open, show: () => setOpen(true), close: () => setOpen(false) };
};
