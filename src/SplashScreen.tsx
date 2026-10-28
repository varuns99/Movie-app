import { useEffect, useRef, useState } from "react";

// Timeline: the bar fills for at least MIN_FILL_MS (and waits near the end
// until the app reports ready), then curves into a smile, one eye winks, and
// the splash fades away.
const MIN_FILL_MS = 1200;
const SMILE_MS = 380;
const WINK_DELAY_MS = 140;
const WINK_MS = 640;
const HOLD_MS = 260;
const FADE_MS = 320;
const WAITING_CAP = 0.9;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

// The floor bar is a straight line at y=51 that bends into a smile: its ends
// lift a little and its middle drops.
const mouthPath = (curve: number) => {
  const endY = 51 - 2 * curve;
  const controlY = 51 + 14 * curve;
  return `M13 ${endY} Q32 ${controlY} 51 ${endY}`;
};

type Props = {
  // True once the first screen has what it needs (or the wait ran out); the bar
  // holds near the end until then.
  ready: boolean;
  onDone: () => void;
};

export function SplashScreen({ ready, onDone }: Props) {
  const readyRef = useRef(ready);
  const fillRef = useRef<SVGPathElement>(null);
  const trackRef = useRef<SVGPathElement>(null);
  const [winking, setWinking] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let progress = 0;
    let smileStart = 0;
    const timers: number[] = [];

    const draw = (curve: number, fill: number) => {
      const d = mouthPath(curve);
      fillRef.current?.setAttribute("d", d);
      trackRef.current?.setAttribute("d", d);
      fillRef.current?.style.setProperty("stroke-dashoffset", String(1 - fill));
      trackRef.current?.style.setProperty("opacity", String(0.22 * (1 - curve)));
    };

    const finish = () => {
      timers.push(
        window.setTimeout(() => {
          setWinking(true);
          timers.push(
            window.setTimeout(() => {
              setFading(true);
              timers.push(window.setTimeout(onDone, FADE_MS));
            }, WINK_MS + HOLD_MS),
          );
        }, WINK_DELAY_MS),
      );
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;

      if (smileStart === 0) {
        // Linear time, capped near the end until everything is ready, so the
        // bar never takes less than MIN_FILL_MS.
        progress = Math.min(progress + dt / MIN_FILL_MS, readyRef.current ? 1 : WAITING_CAP);
        draw(0, easeInOut(progress));
        if (progress >= 1) smileStart = now;
      } else {
        const t = Math.min((now - smileStart) / SMILE_MS, 1);
        draw(easeOutBack(t), 1);
        if (t >= 1) {
          draw(1, 1);
          finish();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    draw(0, 0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onDone]);

  return (
    <div className={fading ? "splash fading" : "splash"} role="status" aria-label="Loading">
      <svg className="splash-logo" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect className="splash-eye" x="11" y="16" width="20" height="30" rx="7" fill="var(--accent)" />
        <rect
          className={winking ? "splash-eye splash-eye-right winking" : "splash-eye splash-eye-right"}
          x="33"
          y="16"
          width="20"
          height="30"
          rx="7"
          stroke="var(--accent)"
          strokeWidth="3.5"
        />
        <path ref={trackRef} stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <path
          ref={fillRef}
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
        />
      </svg>
    </div>
  );
}
