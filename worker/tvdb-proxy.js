const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";
const TVDB_ARTWORK_URL = "https://artworks.thetvdb.com";

// Filter results give poster paths like "/banners/..."; make them full links.
const artworkUrl = (path) => (path && path.startsWith("/") ? `${TVDB_ARTWORK_URL}${path}` : path);
const DEFAULT_ALLOWED_ORIGINS = [
  "https://varuns99.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

// TVDB bearer tokens are valid for about a month. Cache it on the Worker's
// module scope (Cloudflare reuses the same isolate across many requests) so
// we don't log in again on every search.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000;
let cachedToken = null;
let cachedTokenAt = 0;

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

const moodKeywordMap = [
  ["cozy", ["romance", "drama", "family", "animation"]],
  ["funny", ["comedy", "adventure"]],
  ["romantic", ["romance"]],
  ["tense", ["thriller", "suspense", "crime", "action", "mystery"]],
  ["scary", ["horror"]],
  ["weird", ["sci-fi", "science fiction", "fantasy"]],
  ["low-effort", ["comedy", "family", "animation"]],
];

const moodFromGenres = (genres) => {
  const lowerGenres = genres.map((genre) => genre.toLowerCase());
  const moods = new Set();
  moodKeywordMap.forEach(([mood, keywords]) => {
    if (keywords.some((keyword) => lowerGenres.some((genre) => genre.includes(keyword)))) {
      moods.add(mood);
    }
  });
  return Array.from(moods).slice(0, 3);
};

const youtubeEmbedUrl = (url) => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : undefined;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const login = async (env) => {
  const response = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(env.TVDB_PIN ? { apikey: env.TVDB_API_KEY, pin: env.TVDB_PIN } : { apikey: env.TVDB_API_KEY }),
  });

  if (!response.ok) {
    throw new Error("TVDB login failed");
  }

  const body = await response.json();
  const token = body?.data?.token;
  if (!token) {
    throw new Error("TVDB login returned no token");
  }

  cachedToken = token;
  cachedTokenAt = Date.now();
  return token;
};

const getToken = async (env) => {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  return login(env);
};

const tvdbFetch = async (path, env, params = {}) => {
  const url = new URL(`${TVDB_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, value);
  });

  const attempt = async (token) =>
    fetch(url, { headers: { authorization: `Bearer ${token}` } });

  let token = await getToken(env);
  let response = await attempt(token);

  if (response.status === 401) {
    cachedToken = null;
    token = await getToken(env);
    response = await attempt(token);
  }

  if (!response.ok) {
    throw new Error(`TVDB request failed: ${path}`);
  }

  return response.json();
};

const toCandidate = (result, extended) => {
  const genres = (extended.genres?.length ? extended.genres.map((genre) => genre.name) : result.genres || []).filter(
    Boolean,
  );

  const trailer = extended.trailers?.map((item) => youtubeEmbedUrl(item.url)).find(Boolean);
  const searchTerms = [
    ...(result.aliases || []),
    result.name_translated,
    ...(result.translationsWithLang || []),
  ].filter((term) => typeof term === "string" && term.trim());

  return {
    source: "tvdb",
    tvdbId: Number(result.tvdb_id || extended.id),
    title: result.name || extended.name || "Untitled",
    year: result.year || (extended.year ? String(extended.year) : "TBA"),
    runtime: extended.runtime || 100,
    genres: genres.slice(0, 3),
    moods: moodFromGenres(genres),
    synopsis:
      result.overview || extended.overview || "No synopsis yet. Add it to the maybe pile and let the room decide.",
    posterUrl: extended.image || result.image_url || result.poster || "/poster-placeholder.svg",
    trailerUrl: trailer,
    searchTerms: Array.from(new Set(searchTerms)),
  };
};

const searchMovies = async (query, env) => {
  const searchBody = await tvdbFetch("/search", env, { query, type: "movie", limit: 6 });
  const results = (searchBody.data || []).filter((result) => result.tvdb_id).slice(0, 6);

  return Promise.all(
    results.map(async (result) => {
      let extended = {};
      try {
        extended = (await tvdbFetch(`/movies/${Number(result.tvdb_id)}/extended`, env)).data || {};
      } catch {
        extended = {};
      }
      return toCandidate(result, extended);
    }),
  );
};

// Prefer the English title and synopsis when TVDB has them, so a foreign film
// that browses under its original title reads clearly once it is picked.
const movieDetails = async (id, env) => {
  const extended = (await tvdbFetch(`/movies/${id}/extended`, env, { meta: "translations" })).data || {};
  const translations = extended.translations || {};
  const englishName = (translations.nameTranslations || []).find((item) => item.language === "eng")?.name;
  const englishOverview = (translations.overviewTranslations || []).find((item) => item.language === "eng")?.overview;
  const candidate = toCandidate({ tvdb_id: id }, extended);
  return {
    ...candidate,
    title: englishName || candidate.title,
    synopsis: englishOverview || extended.overview || "",
    posterUrl: artworkUrl(candidate.posterUrl),
  };
};

// TVDB genre ids, looked up once per isolate by name ("Action" -> 1).
let cachedGenreIds = null;
const genreAliases = { "sci-fi": "science fiction" };

const genreIdFor = async (name, env) => {
  if (!cachedGenreIds) {
    const body = await tvdbFetch("/genres", env);
    cachedGenreIds = new Map((body.data || []).map((genre) => [String(genre.name).toLowerCase(), genre.id]));
  }
  const key = name.toLowerCase();
  return cachedGenreIds.get(genreAliases[key] || key);
};

const MAX_YEARS = 6;
const MAX_DISCOVER_RESULTS = 60;

// Browse movies by language, release year(s), genre and runtime. TVDB filters
// one release year per request, so the client sends a few sample years.
const discoverMovies = async (params, env) => {
  const years = (params.get("years") || "")
    .split(",")
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year) && year >= 1888 && year <= new Date().getFullYear() + 1)
    .slice(0, MAX_YEARS);
  if (!years.length) return [];

  const lang = params.get("lang") || undefined;
  const maxRuntime = Number(params.get("maxRuntime")) || Infinity;
  const genreName = params.get("genre") || "";
  let genreId;
  if (genreName) {
    genreId = await genreIdFor(genreName, env);
    if (genreId === undefined) return [];
  }

  const pages = await Promise.all(
    years.map((year) =>
      tvdbFetch("/movies/filter", env, {
        year: String(year),
        lang,
        genre: genreId === undefined ? undefined : String(genreId),
        sort: "score",
        sortType: "desc",
        page: "0",
      })
        .then((body) => (Array.isArray(body.data) ? body.data : []))
        .catch(() => null),
    ),
  );
  // One bad year should not sink the search, but if every request failed
  // (for example, TVDB rejected the filter) report it instead of "no movies".
  if (pages.every((page) => page === null)) throw new Error("TVDB filter failed");

  const seen = new Set();
  return pages
    .flatMap((page) => page || [])
    .filter((movie) => {
      if (!movie?.id || !movie.image || seen.has(movie.id)) return false;
      seen.add(movie.id);
      return !movie.runtime || movie.runtime <= maxRuntime;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_DISCOVER_RESULTS)
    .map((movie) => ({
      source: "tvdb",
      tvdbId: Number(movie.id),
      title: movie.name || "Untitled",
      year: movie.year ? String(movie.year) : "TBA",
      runtime: movie.runtime || 100,
      genres: genreName ? [genreName] : [],
      moods: moodFromGenres(genreName ? [genreName] : []),
      synopsis: "",
      posterUrl: artworkUrl(movie.image),
      language: lang,
    }));
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

    const routes = ["/search", "/discover", "/movie"];
    if (request.method !== "GET" || !routes.includes(url.pathname)) {
      return json({ error: "Not found" }, { status: 404 }, corsHeaders);
    }

    if (!env.TVDB_API_KEY) {
      return json({ error: "TVDB_API_KEY is not configured" }, { status: 500 }, corsHeaders);
    }

    const cached = { headers: { "cache-control": "public, max-age=3600" } };

    try {
      if (url.pathname === "/discover") {
        return json({ results: await discoverMovies(url.searchParams, env) }, cached, corsHeaders);
      }

      if (url.pathname === "/movie") {
        const id = Number(url.searchParams.get("id"));
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Bad movie id" }, { status: 400 }, corsHeaders);
        return json({ result: await movieDetails(id, env) }, cached, corsHeaders);
      }

      const query = url.searchParams.get("query")?.trim() || "";
      if (query.length < 2 || query.length > 80) {
        return json({ results: [] }, {}, corsHeaders);
      }
      return json({ results: await searchMovies(query, env) }, cached, corsHeaders);
    } catch {
      return json({ error: "TVDB request failed" }, { status: 502 }, corsHeaders);
    }
  },
};
