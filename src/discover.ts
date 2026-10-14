import { demoCandidates } from "./demoData";
import { hasMovieProxy, movieProxyUrl, placeholderPosterUrl } from "./movieSearch";
import { normalizeTrailerUrl } from "./trailers";
import type { MovieCandidate } from "./types";

export type DiscoverFilters = {
  language: string;
  yearFrom: number;
  yearTo: number;
  // Empty means "any"; otherwise a film needs at least one of these.
  genres: string[];
  maxRuntime: number;
};

export const CURRENT_YEAR = new Date().getFullYear();
export const FIRST_YEAR = 1940;

// English, the latest three release years (2024 to 2026 in 2026), any genre, up to 150 minutes.
export const defaultDiscoverFilters: DiscoverFilters = {
  language: "eng",
  yearFrom: CURRENT_YEAR - 2,
  yearTo: CURRENT_YEAR,
  genres: [],
  maxRuntime: 150,
};

// Newest first, for the year dropdowns.
export const ALL_YEARS = Array.from({ length: CURRENT_YEAR - FIRST_YEAR + 1 }, (_, index) => CURRENT_YEAR - index);

export const DISCOVER_LANGUAGES = [
  { code: "any", label: "Any language" },
  { code: "eng", label: "English" },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "zho", label: "Chinese" },
  { code: "hin", label: "Hindi" },
  { code: "hrv", label: "Croatian" },
  { code: "pol", label: "Polish" },
  { code: "srp", label: "Serbian" },
  { code: "tam", label: "Tamil" },
  { code: "ukr", label: "Ukrainian" },
];

export const DISCOVER_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
];

export const MAX_DISCOVER_RUNTIME = 240;

// Languages the cross-check can report that are not in the browse list.
const OTHER_LANGUAGE_NAMES: Record<string, string> = {
  ara: "Arabic",
  ben: "Bengali",
  bos: "Bosnian",
  bul: "Bulgarian",
  ces: "Czech",
  cnr: "Montenegrin",
  dan: "Danish",
  ell: "Greek",
  fas: "Persian",
  fin: "Finnish",
  hbs: "Serbo-Croatian",
  heb: "Hebrew",
  hun: "Hungarian",
  ind: "Indonesian",
  isv: "Interslavic",
  mal: "Malayalam",
  nld: "Dutch",
  nor: "Norwegian",
  ron: "Romanian",
  rus: "Russian",
  slk: "Slovak",
  slv: "Slovenian",
  swe: "Swedish",
  tel: "Telugu",
  tha: "Thai",
  tur: "Turkish",
  vie: "Vietnamese",
};

// "eng" -> "English"; unknown codes are shown as typed, in capitals.
export const languageName = (code: string) =>
  DISCOVER_LANGUAGES.find((language) => language.code === code)?.label ?? OTHER_LANGUAGE_NAMES[code] ?? code.toUpperCase();
const POOL_SIZE = 20;
const YEAR_SAMPLES = 4;
// TVDB filters by one year and one genre per request, so a search makes
// (sample years x chosen genres) requests. Keep that product small.
const MAX_REQUESTS = 12;
export const MAX_GENRES = 5;

const normalizeGenre = (genre: string) => {
  const lower = genre.toLowerCase();
  return lower === "sci-fi" ? "science fiction" : lower;
};

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

// The movie service filters by one release year at a time, so a date range is
// covered by sampling a few years spread across it. Each search picks a fresh
// sample, which keeps the roulette from always showing the same films.
export const pickYears = (from: number, to: number, count = YEAR_SAMPLES) => {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const span = high - low + 1;
  if (span <= count) return Array.from({ length: span }, (_, index) => low + index);

  return Array.from({ length: count }, (_, bucket) => {
    const start = low + Math.floor((span * bucket) / count);
    const end = low + Math.floor((span * (bucket + 1)) / count) - 1;
    return start + Math.floor(Math.random() * (end - start + 1));
  });
};

const filterDemoCatalog = (filters: DiscoverFilters) => {
  const low = Math.min(filters.yearFrom, filters.yearTo);
  const high = Math.max(filters.yearFrom, filters.yearTo);
  return demoCandidates.filter((movie) => {
    const year = Number(movie.year);
    if (filters.language !== "any" && movie.language && movie.language !== filters.language) return false;
    if (Number.isFinite(year) && (year < low || year > high)) return false;
    if (movie.runtime > filters.maxRuntime) return false;
    if (
      filters.genres.length &&
      !movie.genres.some((genre) => filters.genres.some((wanted) => normalizeGenre(genre) === normalizeGenre(wanted)))
    ) {
      return false;
    }
    return true;
  });
};

export type DiscoverResult = { movies: MovieCandidate[]; sample: boolean };

export const discoverMovies = async (filters: DiscoverFilters, signal?: AbortSignal): Promise<DiscoverResult> => {
  if (!hasMovieProxy || !movieProxyUrl) {
    return { movies: shuffle(filterDemoCatalog(filters)), sample: true };
  }

  const url = new URL("/discover", movieProxyUrl);
  const genres = filters.genres.slice(0, MAX_GENRES);
  const yearCount = Math.min(YEAR_SAMPLES, Math.max(2, Math.floor(MAX_REQUESTS / Math.max(1, genres.length))));
  url.searchParams.set("years", pickYears(filters.yearFrom, filters.yearTo, yearCount).join(","));
  url.searchParams.set("yearFrom", String(Math.min(filters.yearFrom, filters.yearTo)));
  url.searchParams.set("yearTo", String(Math.max(filters.yearFrom, filters.yearTo)));
  url.searchParams.set("maxRuntime", String(filters.maxRuntime));
  if (filters.language !== "any") url.searchParams.set("lang", filters.language);
  if (genres.length) url.searchParams.set("genre", genres.join(","));

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Movie search is taking the night off.");

  const body = (await response.json()) as { results?: MovieCandidate[] };
  const movies = (body.results ?? []).map((movie) => ({
    ...movie,
    posterUrl: movie.posterUrl?.startsWith("/") ? placeholderPosterUrl : movie.posterUrl || placeholderPosterUrl,
  }));
  return { movies: shuffle(movies).slice(0, POOL_SIZE), sample: false };
};

const VERIFY_WAIT_MS = 5000;

// Browse results come from TVDB's own language labels. This asks which of them
// Wikidata says are in another language, so they can be dropped. It never
// throws: if the check is slow or fails, nothing is removed.
export const findLanguageMismatches = async (
  movies: MovieCandidate[],
  language: string,
  signal: AbortSignal,
): Promise<Set<string>> => {
  const ids = movies.map((movie) => movie.tvdbId).filter((id): id is number => typeof id === "number");
  if (!movieProxyUrl || language === "any" || !ids.length) return new Set();

  const patience = new AbortController();
  const timer = window.setTimeout(() => patience.abort(), VERIFY_WAIT_MS);
  const stop = () => patience.abort();
  signal.addEventListener("abort", stop);
  try {
    const url = new URL("/verify", movieProxyUrl);
    url.searchParams.set("lang", language);
    url.searchParams.set("ids", ids.join(","));
    const response = await fetch(url, { signal: patience.signal });
    if (!response.ok) return new Set();
    const body = (await response.json()) as { mismatched?: string[] };
    return new Set((body.mismatched ?? []).map(String));
  } catch {
    return new Set();
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
};

// What the movie service knows about a film beyond the basics: its original
// language (TVDB's label cross-checked against Wikidata) and its English title
// when that differs from its own. `checked` is false when Wikidata could not be
// asked, in which case the language is only TVDB's unconfirmed label.
export const fetchMovieInfo = async (
  tvdbId: number,
): Promise<{ title?: string; language?: string; englishTitle?: string; checked: boolean }> => {
  if (!movieProxyUrl) return { checked: false };
  try {
    const url = new URL("/movie", movieProxyUrl);
    url.searchParams.set("id", String(tvdbId));
    const response = await fetch(url);
    if (!response.ok) return { checked: false };
    const body = (await response.json()) as { result?: MovieCandidate & { languageChecked?: boolean } };
    return {
      title: body.result?.title || undefined,
      language: body.result?.language || undefined,
      englishTitle: body.result?.englishTitle || undefined,
      checked: Boolean(body.result?.languageChecked),
    };
  } catch {
    return { checked: false };
  }
};

// Discovery cards are light (title, year, poster). The synopsis and trailer are
// fetched only for the movie the roulette lands on.
export const loadMovieDetails = async (movie: MovieCandidate): Promise<MovieCandidate> => {
  if (movie.source !== "tvdb" || !movie.tvdbId || !movieProxyUrl) return movie;

  const url = new URL("/movie", movieProxyUrl);
  url.searchParams.set("id", String(movie.tvdbId));
  const response = await fetch(url);
  if (!response.ok) return movie;

  const body = (await response.json()) as { result?: MovieCandidate };
  if (!body.result) return movie;
  return {
    ...movie,
    ...body.result,
    trailerUrl: normalizeTrailerUrl(body.result.trailerUrl),
    posterUrl: movie.posterUrl,
    genres: body.result.genres?.length ? body.result.genres : movie.genres,
  };
};
