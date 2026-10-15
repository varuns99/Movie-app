import { useEffect, useState, type CSSProperties } from "react";

type StripItem = { id: string; title: string; posterUrl: string };

// How many posters line up on each side of the middle one (fewer for a short list).
const SIDE_COUNT = 5;
// While nothing has been spun, the carousel drifts to the next poster this often.
const DRIFT_MS = 2200;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Where a poster sits: -3 is three places left of the middle, 0 is the middle.
// The list is a loop, so the nearest way round is used.
const offsetFor = (index: number, active: number, count: number) => {
  let offset = (((index - active) % count) + count) % count;
  if (offset > count / 2) offset -= count;
  return offset;
};

// `reach` is how many posters show on each side. The posters at the far ends
// fade away: fully clear one place beyond the reach, so they slide in and out
// of view instead of appearing and disappearing.
const tileStyle = (offset: number, reach: number): CSSProperties => {
  const distance = Math.abs(offset);
  const side = Math.sign(offset);
  const shown = Math.min(distance, reach + 1);
  return {
    // Sideways shift in poster widths: the first side poster tucks behind the middle one.
    "--x": distance === 0 ? 0 : side * (0.62 + (shown - 1) * 0.3),
    "--z": distance === 0 ? "40px" : `${-shown * 40}px`,
    "--ry": `${-side * 46}deg`,
    "--dim": 1 - Math.min(distance, reach) * 0.1,
    "--o": distance <= 1 ? 1 : Math.max(0, 1 - (distance - 1) / Math.max(reach, 1)),
  } as CSSProperties;
};

// The carousel and its spin button. Before the first spin the carousel is
// greyed out, drifts slowly, and cannot be touched, and the button sits on top
// of it; once a spin starts the carousel comes alive and the button slides
// down below it.
export function RouletteStage<T extends StripItem>({
  items,
  activeIndex,
  spinning,
  selectedId,
  label,
  disabled,
  onSpin,
}: {
  items: T[];
  activeIndex: number;
  spinning: boolean;
  selectedId: string | null;
  label: string;
  disabled?: boolean;
  // `from` is the poster in the middle now, so the spin carries on from there.
  onSpin: (from: number) => void;
}) {
  const idle = !spinning && !selectedId;
  const [drift, setDrift] = useState(0);
  const count = items.length;
  const reach = Math.min(SIDE_COUNT, Math.floor((count - 1) / 2));

  useEffect(() => {
    if (!idle || count < 2 || reducedMotion()) return;
    const timer = window.setInterval(() => setDrift((current) => current + 1), DRIFT_MS);
    return () => window.clearInterval(timer);
  }, [idle, count]);

  const middle = idle ? drift % Math.max(count, 1) : activeIndex;
  const mode = spinning ? "spinning" : idle ? "idle" : "landed";

  return (
    <div className={idle ? "roulette-carousel idle" : "roulette-carousel"}>
      <div className="roulette-strip-wrap" inert={idle} aria-hidden={idle || undefined}>
        <div className={`coverflow ${mode}`}>
          <div className="coverflow-stage">
            {items.map((item, index) => {
              const offset = offsetFor(index, middle, count);
                return (
                <div
                  key={item.id}
                  className={offset === 0 ? "cover-tile middle" : "cover-tile"}
                  style={tileStyle(offset, reach)}
                >
                  <img src={item.posterUrl} alt="" draggable={false} />
                </div>
              );
            })}
          </div>
        </div>
        <p className="cover-caption">{items[middle]?.title}</p>
      </div>
      <button type="button" className="spin-button" disabled={disabled} onClick={() => onSpin(middle)}>
        {label}
      </button>
    </div>
  );
}
