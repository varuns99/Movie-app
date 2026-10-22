import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// A spin takes about this long, then slows down only near the end. `pace` is how
// long a step lasts relative to the first one (1 at the start, about 5.7 at the end).
const SPIN_MS = 3700;
const pace = (progress: number) => 1 + 4.73 * progress ** 5;

// Spin-and-land logic shared by the watchlist roulette and the logged-out
// discovery roulette. Items only need a stable string id.
export const useRoulette = <T extends { id: string }>(items: T[]) => {
  const [index, setIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const activeIndex = useMemo(() => {
    if (spinning || !selectedId) return index;
    const selectedIndex = items.findIndex((item) => item.id === selectedId);
    return selectedIndex >= 0 ? selectedIndex : index;
  }, [index, items, selectedId, spinning]);

  useEffect(() => {
    setIndex((current) => (items.length ? current % items.length : 0));
    setSelectedId((current) => (current && items.some((item) => item.id === current) ? current : null));
  }, [items]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // `from` is the position to start turning from (the poster in the middle now).
  const spin = useCallback(
    (from = 0) => {
      if (!items.length || spinning) return;

      const weighted = items.flatMap((item, position) => Array(Math.max(1, items.length - position)).fill(item) as T[]);
      const winner = weighted[Math.floor(Math.random() * weighted.length)];
      const winnerIndex = items.findIndex((item) => item.id === winner.id);
      // Aim for roughly 40 ticks whatever the list size, so a spin takes a few
      // seconds with 5 movies or 50, then slows down as it nears the winner.
      const loops = Math.max(2, Math.ceil(40 / items.length)) + Math.floor(Math.random() * 2);
      const start = ((from % items.length) + items.length) % items.length;
      const totalSteps = loops * items.length + ((winnerIndex - start + items.length) % items.length);

      // Scale the steps so the whole spin lasts about SPIN_MS, but never faster than
      // 32ms a step (a blur) or slower than 55ms (a short list would drag).
      let paceTotal = 0;
      for (let step = 0; step < totalSteps; step++) paceTotal += pace(step / totalSteps);
      const stepMs = Math.max(32, Math.min(55, SPIN_MS / paceTotal));

      setSpinning(true);
      setSelectedId(null);

      const tick = (step: number) => {
        setIndex((start + step) % items.length);
        if (step >= totalSteps) {
          setIndex(winnerIndex);
          setSelectedId(winner.id);
          setSpinning(false);
          return;
        }
        timer.current = window.setTimeout(() => tick(step + 1), stepMs * pace(step / totalSteps));
      };

      tick(0);
    },
    [items, spinning],
  );

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    setSpinning(false);
    setSelectedId(null);
  }, []);

  return { activeIndex, spinning, selectedId, spin, reset };
};
