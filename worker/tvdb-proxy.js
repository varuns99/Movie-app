const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";
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

      const genres = (extended.genres?.length ? extended.genres.map((genre) => genre.name) : result.genres || []).filter(
        Boolean,
      );

      const trailer = extended.trailers?.map((item) => youtubeEmbedUrl(item.url)).find(Boolean);

      return {
        source: "tvdb",
        tvdbId: Number(result.tvdb_id),
        title: result.name || extended.name || "Untitled",
        year: result.year || (extended.year ? String(extended.year) : "TBA"),
        runtime: extended.runtime || 100,
        genres: genres.slice(0, 3),
        moods: moodFromGenres(genres),
        synopsis:
          result.overview || extended.overview || "No synopsis yet. Add it to the maybe pile and let the room decide.",
        posterUrl: extended.image || result.image_url || result.poster || "/poster-placeholder.svg",
        trailerUrl: trailer,
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

    if (!env.TVDB_API_KEY) {
      return json({ error: "TVDB_API_KEY is not configured" }, { status: 500 }, corsHeaders);
    }

    const query = url.searchParams.get("query")?.trim() || "";
    if (query.length < 2 || query.length > 80) {
      return json({ results: [] }, {}, corsHeaders);
    }

    try {
      const results = await searchMovies(query, env);
      return json({ results }, { headers: { "cache-control": "public, max-age=3600" } }, corsHeaders);
    } catch {
      return json({ error: "TVDB search failed" }, { status: 502 }, corsHeaders);
    }
  },
};
