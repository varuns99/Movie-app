import type { Mood, MovieCandidate } from "./types";

const apiKey = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
const baseUrl = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p/w500";

type TmdbSearchResult = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string;
  genre_ids?: number[];
};

type TmdbDetails = {
  runtime?: number;
  genres?: { name: string }[];
  videos?: {
    results?: {
      key: string;
      site: string;
      type: string;
      official?: boolean;
    }[];
  };
};

const genreById: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Sci-Fi",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10770: "TV Movie",
};

const moodFromGenres = (genres: string[]): Mood[] => {
  const moods = new Set<Mood>();
  if (genres.some((genre) => ["Romance", "Drama", "Family", "Animation"].includes(genre))) moods.add("cozy");
  if (genres.some((genre) => ["Comedy", "Adventure"].includes(genre))) moods.add("funny");
  if (genres.includes("Romance")) moods.add("romantic");
  if (genres.some((genre) => ["Thriller", "Crime", "Action", "Mystery"].includes(genre))) moods.add("tense");
  if (genres.includes("Horror")) moods.add("scary");
  if (genres.some((genre) => ["Sci-Fi", "Fantasy"].includes(genre))) moods.add("weird");
  if (genres.some((genre) => ["Comedy", "Family", "Animation"].includes(genre))) moods.add("low-effort");
  return Array.from(moods).slice(0, 3);
};

export const hasTmdbKey = Boolean(apiKey);

export const searchTmdb = async (query: string): Promise<MovieCandidate[]> => {
  if (!apiKey || query.trim().length < 2) return [];

  const searchUrl = new URL(`${baseUrl}/search/movie`);
  searchUrl.searchParams.set("api_key", apiKey);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("include_adult", "false");
  searchUrl.searchParams.set("language", "en-US");

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error("TMDb search is taking the night off.");
  }

  const searchData = (await searchResponse.json()) as { results?: TmdbSearchResult[] };
  const results = (searchData.results ?? []).slice(0, 6);

  return Promise.all(
    results.map(async (movie) => {
      const detailsUrl = new URL(`${baseUrl}/movie/${movie.id}`);
      detailsUrl.searchParams.set("api_key", apiKey);
      detailsUrl.searchParams.set("append_to_response", "videos");
      detailsUrl.searchParams.set("language", "en-US");

      const detailsResponse = await fetch(detailsUrl);
      const details = detailsResponse.ok ? ((await detailsResponse.json()) as TmdbDetails) : {};
      const genres = details.genres?.map((genre) => genre.name) ?? movie.genre_ids?.map((id) => genreById[id]).filter(Boolean) ?? [];
      const trailer = details.videos?.results?.find(
        (video) => video.site === "YouTube" && video.type === "Trailer" && video.official,
      ) ?? details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer");

      return {
        source: "tmdb",
        tmdbId: movie.id,
        title: movie.title ?? movie.name ?? "Untitled",
        year: movie.release_date?.slice(0, 4) || "TBA",
        runtime: details.runtime || 100,
        genres: genres.slice(0, 3),
        moods: moodFromGenres(genres),
        synopsis: movie.overview || "No synopsis yet. Add it to the maybe pile and let the room decide.",
        posterUrl: movie.poster_path ? `${imageBase}${movie.poster_path}` : "/poster-placeholder.svg",
        trailerUrl: trailer ? `https://www.youtube.com/embed/${trailer.key}` : undefined,
      };
    }),
  );
};
