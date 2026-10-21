// Compare titles ignoring case, accents and punctuation ("Južina" = "Juzina").
export const titleKey = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The English title to show small under a title, or undefined when it adds nothing.
export const altTitle = (title: string, englishTitle?: string) =>
  englishTitle && titleKey(englishTitle) !== titleKey(title) ? englishTitle : undefined;

type Identity = { kind?: "movie" | "series"; tvdbId?: number; title: string };

// A stable key for "this exact title", used to avoid adding the same thing twice.
// Movie and series ids overlap in TVDB, so the kind is part of it.
export const identityKey = (item: Pick<Identity, "kind" | "tvdbId">) =>
  item.tvdbId ? `${item.kind ?? "movie"}:${item.tvdbId}` : undefined;

// Same item? By TVDB id and kind when both have one, otherwise by kind and title.
export const isSameItem = (a: Identity, b: Identity) => {
  const first = identityKey(a);
  const second = identityKey(b);
  if (first && second) return first === second;
  return (a.kind ?? "movie") === (b.kind ?? "movie") && titleKey(a.title) === titleKey(b.title);
};

type MetaSource = {
  kind?: "movie" | "series";
  year: string;
  runtime: number;
  seasons?: number;
  seriesStatus?: string;
};

// "2010 • 148 min" for a film; "2023 • 2 seasons • Airing • 56 min/ep" for a series.
// The separator keeps its bullet attached to the text before it, so a wrapped line never starts with one.
export const titleMeta = (item: MetaSource, separator = "\u00a0• ") => {
  if (item.kind !== "series") return [item.year, `${item.runtime}\u00a0min`].join(separator);
  const parts = [item.year];
  if (item.seasons) parts.push(`${item.seasons}\u00a0${item.seasons === 1 ? "season" : "seasons"}`);
  // "Upcoming" is shown by the "not out yet" tag instead.
  if (item.seriesStatus === "Continuing") parts.push("Airing");
  if (item.seriesStatus === "Ended") parts.push("Ended");
  if (item.runtime) parts.push(`${item.runtime}\u00a0min/ep`);
  return parts.join(separator);
};

// The short details line on a Watchlist card: "2010 · 148 min" for a film, "2010 · 11 seasons" for a series
// (episode length and status are in the details window and on the poster).
export const cardMeta = (item: MetaSource) => {
  if (item.kind !== "series") return titleMeta(item, "\u00a0· ");
  const parts = [item.year];
  if (item.seasons) parts.push(`${item.seasons}\u00a0${item.seasons === 1 ? "season" : "seasons"}`);
  return parts.join("\u00a0· ");
};
