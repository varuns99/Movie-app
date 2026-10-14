import { demoCandidates } from "./demoData";
import { hasMovieProxy, movieProxyUrl, placeholderPosterUrl } from "./movieSearch";
import type { MovieCandidate } from "./types";

export type DiscoverFilters = {
  language: string;
  yearFrom: number;
  yearTo: number;
  genre: string;
  maxRuntime: number;
};

export const CURRENT_YEAR = new Date().getFullYear();
export const FIRST_YEAR = 1940;

export const defaultDiscoverFilters: DiscoverFilters = {
  language: "eng",
  yearFrom: 1990,
  yearTo: CURRENT_YEAR,
  genre: "any",
  maxRuntime: 150,
};

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

// "eng" -> "English"; unknown codes are shown as typed, in capitals.
export const languageName = (code: string) =>
  DISCOVER_LANGUAGES.find((language) => language.code === code)?.label ?? code.toUpperCase();
const POOL_SIZE = 20;
const YEAR_SAMPLES = 4;

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
    if (filters.genre !== "any" && !movie.genres.some((genre) => normalizeGenre(genre) === normalizeGenre(filters.genre))) {
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
  url.searchParams.set("years", pickYears(filters.yearFrom, filters.yearTo).join(","));
  url.searchParams.set("maxRuntime", String(filters.maxRuntime));
  if (filters.language !== "any") url.searchParams.set("lang", filters.language);
  if (filters.genre !== "any") url.searchParams.set("genre", filters.genre);

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Movie search is taking the night off.");

  const body = (await response.json()) as { results?: MovieCandidate[] };
  const movies = (body.results ?? []).map((movie) => ({
    ...movie,
    posterUrl: movie.posterUrl?.startsWith("/") ? placeholderPosterUrl : movie.posterUrl || placeholderPosterUrl,
  }));
  return { movies: shuffle(movies).slice(0, POOL_SIZE), sample: false };
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
    posterUrl: movie.posterUrl,
    genres: body.result.genres?.length ? body.result.genres : movie.genres,
  };
};
