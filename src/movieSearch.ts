import type { MovieCandidate } from "./types";

const proxyUrl = import.meta.env.VITE_MOVIE_PROXY_URL as string | undefined;
const placeholderPosterUrl = `${import.meta.env.BASE_URL}poster-placeholder.svg`;

export const hasMovieProxy = Boolean(proxyUrl);

export const searchMovies = async (query: string): Promise<MovieCandidate[]> => {
  if (!proxyUrl || query.trim().length < 2) return [];

  const searchUrl = new URL("/search", proxyUrl);
  searchUrl.searchParams.set("query", query);

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error("Movie search is taking the night off.");
  }

  const searchData = (await searchResponse.json()) as { results?: MovieCandidate[] };
  return (searchData.results ?? []).map((movie) => ({
    ...movie,
    posterUrl: movie.posterUrl?.startsWith("/") ? placeholderPosterUrl : movie.posterUrl || placeholderPosterUrl,
  }));
};
