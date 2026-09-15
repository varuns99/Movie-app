const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://varuns99.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const genreById = {
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

const json = (body, init = {}, corsHeaders = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...init.headers,
    },
  });

const allowedOrigins = (env) =>
  (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsHeadersFor = (request, env) => {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
};

const moodFromGenres = (genres) => {
  const moods = new Set();
  if (genres.some((genre) => ["Romance", "Drama", "Family", "Animation"].includes(genre))) moods.add("cozy");
  if (genres.some((genre) => ["Comedy", "Adventure"].includes(genre))) moods.add("funny");
  if (genres.includes("Romance")) moods.add("romantic");
  if (genres.some((genre) => ["Thriller", "Crime", "Action", "Mystery"].includes(genre))) moods.add("tense");
  if (genres.includes("Horror")) moods.add("scary");
  if (genres.some((genre) => ["Sci-Fi", "Fantasy"].includes(genre))) moods.add("weird");
  if (genres.some((genre) => ["Comedy", "Family", "Animation"].includes(genre))) moods.add("low-effort");
  return Array.from(moods).slice(0, 3);
};

const tmdbUrl = (path, env, params = {}) => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const searchMovies = async (query, env) => {
  const searchResponse = await fetch(
    tmdbUrl("/search/movie", env, {
      query,
      include_adult: "false",
    }),
  );

  if (!searchResponse.ok) {
    throw new Error("TMDb search failed");
  }

  const searchData = await searchResponse.json();
  const movies = (searchData.results || []).slice(0, 6);

  return Promise.all(
    movies.map(async (movie) => {
      const detailsResponse = await fetch(
        tmdbUrl(`/movie/${movie.id}`, env, {
          append_to_response: "videos",
        }),
      );
      const details = detailsResponse.ok ? await detailsResponse.json() : {};
      const genres =
        details.genres?.map((genre) => genre.name) ||
        movie.genre_ids?.map((id) => genreById[id]).filter(Boolean) ||
        [];
      const trailer =
        details.videos?.results?.find(
          (video) => video.site === "YouTube" && video.type === "Trailer" && video.official,
        ) || details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer");

      return {
        source: "tmdb",
        tmdbId: movie.id,
        title: movie.title || movie.name || "Untitled",
        year: movie.release_date?.slice(0, 4) || "TBA",
        runtime: details.runtime || 100,
        genres: genres.slice(0, 3),
        moods: moodFromGenres(genres),
        synopsis: movie.overview || "No synopsis yet. Add it to the maybe pile and let the room decide.",
        posterUrl: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : "/poster-placeholder.svg",
        trailerUrl: trailer ? `https://www.youtube.com/embed/${trailer.key}` : undefined,
      };
    }),
  );
};

export default {
  async fetch(request, env) {
    const corsHeaders = corsHeadersFor(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true }, {}, corsHeaders);
    }

    if (request.method !== "GET" || url.pathname !== "/search") {
      return json({ error: "Not found" }, { status: 404 }, corsHeaders);
    }

    if (!env.TMDB_API_KEY) {
      return json({ error: "TMDB_API_KEY is not configured" }, { status: 500 }, corsHeaders);
    }

    const query = url.searchParams.get("query")?.trim() || "";
    if (query.length < 2 || query.length > 80) {
      return json({ results: [] }, {}, corsHeaders);
    }

    try {
      const results = await searchMovies(query, env);
      return json({ results }, { headers: { "cache-control": "public, max-age=3600" } }, corsHeaders);
    } catch {
      return json({ error: "TMDb search failed" }, { status: 502 }, corsHeaders);
    }
  },
};
