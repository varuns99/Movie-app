import type { MutableRefObject } from "react";

type StripItem = { id: string; title: string; posterUrl: string };

export function RouletteStrip<T extends StripItem>({
  items,
  activeIndex,
  spinning,
  tileRefs,
}: {
  items: T[];
  activeIndex: number;
  spinning: boolean;
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  return (
    <div className={spinning ? "roulette-strip spinning" : "roulette-strip"}>
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(node) => {
            if (node) {
              tileRefs.current.set(item.id, node);
            } else {
              tileRefs.current.delete(item.id);
            }
          }}
          className={index === activeIndex ? "roulette-tile active" : "roulette-tile"}
        >
          <img src={item.posterUrl} alt="" />
          <span>{item.title}</span>
        </div>
      ))}
    </div>
  );
}
