import type { MovieCandidate } from "./types";

const proxyUrl = import.meta.env.VITE_MOVIE_PROXY_URL as string | undefined;
const placeholderPosterUrl = `${import.meta.env.BASE_URL}poster-placeholder.svg`;
const suggestionCacheKey = "movie-night-roulette-search-suggestions-v1";
const maxCachedSuggestions = 60;

export const hasMovieProxy = Boolean(proxyUrl);

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const readSuggestionCache = (): MovieCandidate[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(suggestionCacheKey) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as MovieCandidate[]) : [];
  } catch {
    return [];
  }
};

const writeSuggestionCache = (movies: MovieCandidate[]) => {
  try {
    const existing = readSuggestionCache();
    const merged = [...movies, ...existing].filter(
      (movie, index, all) =>
        typeof movie?.title === "string" &&
        all.findIndex((item) => item.tvdbId === movie.tvdbId && item.title === movie.title) === index,
    );
    localStorage.setItem(suggestionCacheKey, JSON.stringify(merged.slice(0, maxCachedSuggestions)));
  } catch {
    // Search still works when storage is unavailable or full.
  }
};

const candidateSearchText = (movie: MovieCandidate) =>
  [movie.title, ...(movie.searchTerms ?? [])].map(normalizeSearchText);

export const getCachedMovieSuggestions = (query: string): MovieCandidate[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return [];

  return readSuggestionCache()
    .map((movie) => {
      const terms = candidateSearchText(movie);
      const score = terms.some((term) => term.startsWith(normalizedQuery))
        ? 0
        : terms.some((term) => term.split(" ").some((word) => word.startsWith(normalizedQuery)))
          ? 1
          : terms.some((term) => term.includes(normalizedQuery))
            ? 2
            : 3;
      return { movie, score };
    })
    .filter(({ score }) => score < 3)
    .sort((a, b) => a.score - b.score || a.movie.title.localeCompare(b.movie.title))
    .slice(0, 6)
    .map(({ movie }) => movie);
};

export const searchMovies = async (query: string): Promise<MovieCandidate[]> => {
  if (!proxyUrl || query.trim().length < 2) return [];

  const searchUrl = new URL("/search", proxyUrl);
  searchUrl.searchParams.set("query", query);

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error("Movie search is taking the night off.");
  }

  const searchData = (await searchResponse.json()) as { results?: MovieCandidate[] };
  const results = (searchData.results ?? []).map((movie) => ({
    ...movie,
    posterUrl: movie.posterUrl?.startsWith("/") ? placeholderPosterUrl : movie.posterUrl || placeholderPosterUrl,
  }));
  writeSuggestionCache(results);
  return results;
};
