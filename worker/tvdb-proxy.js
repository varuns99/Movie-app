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

// A YouTube video id is 11 characters. TVDB holds many link shapes, including
// broken ones (".../embed/?v=ID", "watch?v=?v=ID"), so the id is picked out of
// the link instead of trusting its shape.
const YOUTUBE_ID = /(?:[?&]v=|\/embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

const youtubeEmbedUrl = (url) => {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    if (!host.includes("youtube.com") && !host.includes("youtu.be")) return undefined;
  } catch {
    return undefined;
  }
  const id = url.match(YOUTUBE_ID)?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : undefined;
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

// ---------------------------------------------------------------------------
// Language cross-check against Wikidata
// ---------------------------------------------------------------------------
// TVDB's language label is occasionally wrong (a 1970 Croatian film filed as
// English). Wikidata links to TVDB by movie id and records each film's original
// language, so we ask it as a second opinion. Its data is CC0. Every failure
// path falls back to TVDB's own value, so a Wikidata outage never breaks search.

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_USER_AGENT = "TwoSeatsApp/1.0 (https://github.com/varuns99/Movie-app; movie language check)";
const WIKIDATA_TTL_MS = 24 * 60 * 60 * 1000;
// Search and details wait this long for Wikidata, then use TVDB's language. The
// browse check runs separately (/verify) and may take longer: nobody waits on it.
const WIKIDATA_TIMEOUT_MS = 2000;
const WIKIDATA_ATTEMPTS = 2;
const WIKIDATA_VERIFY_TIMEOUT_MS = 8000;
const WIKIDATA_BATCH = 100;
const wikidataCache = new Map();

// Wikidata's codes mapped onto the ones TVDB uses.
const normalizeLanguageCode = (code) => ({ cmn: "zho", yue: "zho", nob: "nor", nno: "nor" })[code] || code;
// Wikidata often says "Serbo-Croatian" (hbs) where TVDB says Serbian or Croatian.
const SOUTH_SLAVIC = ["srp", "hrv", "bos", "cnr", "hbs"];

// tvdb id -> language codes Wikidata lists as the film's original language.
const wikidataLanguages = async (ids, timeoutMs = WIKIDATA_TIMEOUT_MS, attempts = WIKIDATA_ATTEMPTS) => {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const result = new Map();
  const missing = [];
  unique.forEach((id) => {
    const hit = wikidataCache.get(id);
    if (hit && Date.now() - hit.at < WIKIDATA_TTL_MS) result.set(id, hit.codes);
    else missing.push(id);
  });

  for (let start = 0; start < missing.length; start += WIKIDATA_BATCH) {
    const chunk = missing.slice(start, start + WIKIDATA_BATCH);
    const values = chunk.map((id) => `"${id.replace(/[^0-9]/g, "")}"`).join(" ");
    const query = `SELECT ?tvdb ?code WHERE { VALUES ?tvdb { ${values} } ?film wdt:P12196 ?tvdb . ?film wdt:P364 ?language . ?language wdt:P220 ?code }`;
    // Wikidata sometimes turns a request away (busy, or shared-address limits);
    // one quick retry recovers most of those. If it still fails we keep TVDB's
    // language for these films and the caller is told they were not checked.
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(WIKIDATA_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/sparql-results+json",
            "user-agent": WIKIDATA_USER_AGENT,
          },
          body: new URLSearchParams({ query }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Wikidata ${response.status}`);
        const body = await response.json();
        const found = new Map();
        (body.results?.bindings || []).forEach((row) => {
          const id = row.tvdb.value;
          found.set(id, [...(found.get(id) || []), row.code.value]);
        });
        chunk.forEach((id) => {
          const codes = [...new Set((found.get(id) || []).map(normalizeLanguageCode))];
          wikidataCache.set(id, { codes, at: Date.now() });
          result.set(id, codes);
        });
        break;
      } catch {
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  return result;
};

// The language to store for a film, given TVDB's label and Wikidata's opinion.
const resolveLanguage = (tvdbCode, wikidataCodes) => {
  const codes = wikidataCodes || [];
  if (!codes.length) return tvdbCode;
  if (tvdbCode && codes.includes(tvdbCode)) return tvdbCode;
  if (tvdbCode && SOUTH_SLAVIC.includes(tvdbCode) && codes.includes("hbs")) return tvdbCode;
  const specific = codes.filter((code) => code !== "hbs");
  if (specific.length === 1) return specific[0];
  return tvdbCode || specific[0];
};

// Browsing by language: keep a film unless Wikidata clearly lists other languages.
const matchesLanguage = (wanted, wikidataCodes) => {
  const codes = wikidataCodes || [];
  if (!codes.length || codes.includes(wanted)) return true;
  return SOUTH_SLAVIC.includes(wanted) && codes.includes("hbs");
};

// Returns the candidates with their language cross-checked, plus whether
// Wikidata actually answered for every one (an unanswered film keeps TVDB's
// language, and the caller must not treat that as verified or cache it long).
const withCheckedLanguages = async (candidates) => {
  const known = await wikidataLanguages(candidates.map((candidate) => candidate.tvdbId));
  return {
    complete: candidates.every((candidate) => known.has(String(candidate.tvdbId))),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      language: resolveLanguage(candidate.language, known.get(String(candidate.tvdbId))),
    })),
  };
};

// TVDB lists external ids on each film; the IMDb one ("tt0066461") lets the app
// link to the film's IMDb page. Anything that is not a plain IMDb title id is ignored.
const imdbIdFrom = (remoteIds) => {
  const id = (remoteIds || []).find((remote) => String(remote.sourceName).toLowerCase().includes("imdb"))?.id;
  return /^tt\d{6,10}$/.test(String(id || "")) ? String(id) : undefined;
};

// Is the film still to come? TVDB's own status ("Released", "Announced",
// "Post-Production"...) decides when it has one; an older film is never upcoming
// whatever its status says, and a later year's film is always upcoming. With no status, a release date in the future or a
// release year after this one means it is not out yet. `releaseDate` is the
// earliest date still ahead of us ("2027-11-05"), when TVDB lists one.
const releaseInfo = ({ statusName, year, dates }) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = Number(today.slice(0, 4));
  const releaseYear = Number(year);
  const future = dates.filter((date) => date > today).sort()[0];
  const status = String(statusName || "").trim().toLowerCase();

  let upcoming;
  if (Number.isFinite(releaseYear) && releaseYear < thisYear) upcoming = false;
  else if (Number.isFinite(releaseYear) && releaseYear > thisYear) upcoming = true; // Cannot be out yet, whatever the status says.
  else if (status) upcoming = status !== "released";
  else if (dates.length) upcoming = Boolean(future) && !dates.some((date) => date <= today);
  else upcoming = Number.isFinite(releaseYear) && releaseYear > thisYear;

  return { upcoming, releaseDate: upcoming ? future : undefined };
};

const datesFrom = (extended) =>
  [...(extended.releases || []), extended.first_release]
    .map((release) => String(release?.date || release?.Date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

// Every title a search result goes by: its own name, aliases and the translated
// titles TVDB lists ("Verdens Verste Menneske" is also "The Worst Person in the
// World"). Whatever the fields are called, anything that looks like a name or
// a translation is taken (never the descriptions).
const titleTexts = (result) => {
  const found = [];
  const add = (value, depth = 0) => {
    if (typeof value === "string") {
      if (value.trim()) found.push(value.trim());
    } else if (depth < 2 && value && typeof value === "object") {
      Object.values(value).forEach((item) => add(item, depth + 1));
    }
  };
  Object.entries(result || {}).forEach(([key, value]) => {
    if (/overview/i.test(key)) return;
    if (/^(name|extended_title)$|alias|translat|title/i.test(key)) add(value);
  });
  return [...new Set(found)];
};

const toCandidate = (result, extended) => {
  const genres = (extended.genres?.length ? extended.genres.map((genre) => genre.name) : result.genres || []).filter(
    Boolean,
  );

  const trailer = extended.trailers?.map((item) => youtubeEmbedUrl(item.url)).find(Boolean);
  const searchTerms = titleTexts(result);

  const year = result.year || (extended.year ? String(extended.year) : "TBA");
  const release = releaseInfo({
    statusName: extended.status?.name || (typeof result.status === "string" ? result.status : result.status?.name),
    year,
    dates: datesFrom(extended),
  });

  return {
    source: "tvdb",
    tvdbId: Number(result.tvdb_id || extended.id),
    title: result.name || extended.name || "Untitled",
    year,
    upcoming: release.upcoming,
    releaseDate: release.releaseDate,
    runtime: extended.runtime || 100,
    genres: genres.slice(0, 3),
    moods: moodFromGenres(genres),
    synopsis:
      result.overview || extended.overview || "No synopsis yet. Add it to the maybe pile and let the room decide.",
    posterUrl: extended.image || result.image_url || result.poster || "/poster-placeholder.svg",
    trailerUrl: trailer,
    language: result.primary_language || extended.originalLanguage || undefined,
    imdbId: imdbIdFrom(extended.remoteIds),
    searchTerms: Array.from(new Set(searchTerms)),
  };
};

// TVDB applies its result limit before narrowing to movies, so a long or
// spider-heavy query can fill a small limit with series, people and lists and
// leave no movies at all. Ask for plenty and pick the movies ourselves.
const SEARCH_POOL = 50;
const SEARCH_RESULTS = 6;
const MAX_SEARCH_VARIANTS = 6;

const searchPool = async (query, env) => {
  const body = await tvdbFetch("/search", env, { query, type: "movie", limit: SEARCH_POOL });
  return (body.data || []).filter((result) => result.tvdb_id && (!result.type || result.type === "movie"));
};

// TVDB wants whole words (and the hyphens of "Spider-Man"), but people type a
// word at a time. So besides what was typed, ask without the last one or two
// words (they may be half typed) and with "spiderman" spelled "spider-man".
const searchVariants = (query) => {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const bases = [words];
  if (words.length >= 2) bases.push(words.slice(0, -1));
  if (words.length >= 3) bases.push(words.slice(0, -2));
  const variants = new Set();
  bases.forEach((base) => {
    const text = base.join(" ");
    variants.add(text);
    const hyphenated = text.replace(/\b([a-z]{3,})man\b/gi, "$1-man");
    if (hyphenated !== text) variants.add(hyphenated);
  });
  return [...variants].slice(0, MAX_SEARCH_VARIANTS);
};

// Lower is a better match. Titles are compared ignoring case, accents,
// punctuation, spaces and "and" ("deadpool and wolverine" = "Deadpool & Wolverine"),
// so "spiderman brand n" starts "Spider-Man: Brand New Day". A match on the
// film's own title counts for more than one on a translation or alias, so a
// foreign film that is merely called the same in English comes after the real one.
const matchKey = (text) =>
  titleKey(text)
    .split(" ")
    .filter((word) => word && word !== "and")
    .join("");

const rankAgainst = (names, want) => {
  if (!want) return 4;
  if (names.some((name) => name === want)) return 0;
  if (names.some((name) => name.startsWith(want))) return 1;
  if (names.some((name) => name.includes(want))) return 2;
  // The typed text goes on past a whole title: the longer that title, the better.
  const longest = Math.max(0, ...names.filter((name) => name.length >= 4 && want.startsWith(name)).map((name) => name.length));
  if (longest) return 3 + 0.4 * (1 - longest / want.length);
  return 4;
};

const matchRank = (result, query) => {
  const want = matchKey(query);
  const own = rankAgainst(
    [result.name].filter((name) => typeof name === "string").map(matchKey),
    want,
  );
  const others = titleTexts(result)
    .filter((name) => name !== result.name)
    .map(matchKey);
  return Math.min(own, rankAgainst(others, want) + 0.5);
};

// Pick what to show. Titles that really match what was typed come first (ties
// keep TVDB's order); titles that do not match at all are dropped. The one
// exception is a short query with no real match, where TVDB's own fuzzy answer
// (a typo such as "inceptoin") is better than nothing.
const chooseSearchResults = (pools, query) => {
  const seen = new Set();
  const all = pools.flat().filter((result) => !seen.has(result.tvdb_id) && seen.add(result.tvdb_id));
  const ranked = all
    .map((result, index) => ({ result, index, rank: matchRank(result, query) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const strong = ranked.filter((item) => item.rank < 4);
  const words = query.trim().split(/\s+/).filter(Boolean);
  const chosen = strong.length ? strong : words.length <= 2 ? (pools[0] || []).map((result, index) => ({ result, index })) : [];
  return chosen.slice(0, SEARCH_RESULTS).map((item) => item.result);
};

const searchMovies = async (query, env) => {
  const answers = await Promise.all(searchVariants(query).map((variant) => searchPool(variant, env).catch(() => null)));
  // One failed variant should not sink the search; all of them failing should be reported.
  if (answers.every((answer) => answer === null)) throw new Error("TVDB search failed");
  const results = chooseSearchResults(
    answers.map((answer) => answer || []),
    query,
  );

  const candidates = await Promise.all(
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
  const checked = await withCheckedLanguages(candidates);
  return { results: checked.candidates, complete: checked.complete };
};

// Compare titles ignoring case, accents and punctuation ("Južina" = "Juzina").
const titleKey = (title) =>
  String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The title is the film's own: its name in its original language when TVDB has
// one ("Južina"). The English title ("Sirocco") comes back separately, and only
// when it is genuinely different, so the app can show it small underneath. The
// synopsis prefers English.
const movieDetails = async (id, env) => {
  const extended = (await tvdbFetch(`/movies/${id}/extended`, env, { meta: "translations" })).data || {};
  const translations = extended.translations || {};
  const nameIn = (code) => (translations.nameTranslations || []).find((item) => item.language === code)?.name;
  const englishOverview = (translations.overviewTranslations || []).find((item) => item.language === "eng")?.overview;
  const checked = await withCheckedLanguages([toCandidate({ tvdb_id: id }, extended)]);
  const candidate = checked.candidates[0];

  const originalTitle = (candidate.language && nameIn(candidate.language)) || candidate.title;
  const englishName = nameIn("eng");
  const englishTitle = englishName && titleKey(englishName) !== titleKey(originalTitle) ? englishName : undefined;

  return {
    ...candidate,
    languageChecked: checked.complete,
    title: originalTitle,
    englishTitle,
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
const MAX_GENRES = 5;
const MAX_FILTER_REQUESTS = 24;
const MAX_DISCOVER_RESULTS = 60;

// Browse movies by language, release year(s), genre(s) and runtime. TVDB filters
// one release year and one genre per request, so the client sends a few sample
// years and the worker asks once per (year, genre) pair and merges the answers:
// a film matches if it has at least one of the chosen genres.
const discoverMovies = async (params, env) => {
  const years = (params.get("years") || "")
    .split(",")
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year) && year >= 1888 && year <= new Date().getFullYear() + 1)
    .slice(0, MAX_YEARS);
  if (!years.length) return [];

  const lang = params.get("lang") || undefined;
  const maxRuntime = Number(params.get("maxRuntime")) || Infinity;
  // TVDB's year filter is loose (asking for 2025 also returns films it lists as
  // 2024, since a regional release date can fall in 2025), so the chosen range
  // is enforced on each film's own release year.
  const yearFrom = Number(params.get("yearFrom")) || -Infinity;
  const yearTo = Number(params.get("yearTo")) || Infinity;
  const genreNames = [...new Set((params.get("genre") || "").split(",").map((name) => name.trim()).filter(Boolean))].slice(
    0,
    MAX_GENRES,
  );

  const genres = [];
  for (const name of genreNames) {
    const id = await genreIdFor(name, env);
    if (id !== undefined) genres.push({ name, id });
  }
  if (genreNames.length && !genres.length) return [];

  const tasks = years
    .flatMap((year) => (genres.length ? genres.map((genre) => ({ year, genre })) : [{ year, genre: null }]))
    .slice(0, MAX_FILTER_REQUESTS);

  const pages = await Promise.all(
    tasks.map((task) =>
      tvdbFetch("/movies/filter", env, {
        year: String(task.year),
        lang,
        genre: task.genre ? String(task.genre.id) : undefined,
        sort: "score",
        sortType: "desc",
        page: "0",
      })
        .then((body) => (Array.isArray(body.data) ? body.data : []).map((movie) => ({ movie, genre: task.genre?.name })))
        .catch(() => null),
    ),
  );
  // One bad request should not sink the search, but if every request failed
  // (for example, TVDB rejected the filter) report it instead of "no movies".
  if (pages.every((page) => page === null)) throw new Error("TVDB filter failed");

  // Merge duplicates, remembering every chosen genre a film turned up under.
  const merged = new Map();
  pages
    .flatMap((page) => page || [])
    .forEach(({ movie, genre }) => {
      if (!movie?.id || !movie.image) return;
      if (movie.runtime && movie.runtime > maxRuntime) return;
      const releaseYear = Number(movie.year);
      if (Number.isFinite(releaseYear) && (releaseYear < yearFrom || releaseYear > yearTo)) return;
      const entry = merged.get(movie.id) || { movie, genres: new Set() };
      if (genre) entry.genres.add(genre);
      merged.set(movie.id, entry);
    });

  // These come straight from TVDB's language filter so the list is quick. The
  // app then asks /verify which of them Wikidata says are in another language.
  return [...merged.values()]
    .sort((a, b) => (b.movie.score || 0) - (a.movie.score || 0))
    .slice(0, MAX_DISCOVER_RESULTS)
    .map(({ movie, genres: matched }) => {
      const names = [...matched].slice(0, 3);
      return {
        source: "tvdb",
        tvdbId: Number(movie.id),
        title: movie.name || "Untitled",
        year: movie.year ? String(movie.year) : "TBA",
        upcoming: releaseInfo({ statusName: movie.status?.name, year: movie.year, dates: [] }).upcoming,
        tvdbStatus: movie.status?.name || undefined,
        runtime: movie.runtime || 100,
        genres: names,
        moods: moodFromGenres(names),
        synopsis: "",
        posterUrl: artworkUrl(movie.image),
        language: movie.originalLanguage || lang,
      };
    });
};

// Which of these TVDB films does Wikidata say are NOT in the wanted language?
// Films Wikidata doesn't know, or that it can't be asked about right now, are
// never reported, so the answer only ever removes clear mismatches.
const verifyLanguage = async (params) => {
  const wanted = params.get("lang") || "";
  const ids = (params.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d{1,9}$/.test(id))
    .slice(0, 100);
  if (!wanted || !ids.length) return { mismatched: [], checked: 0, requested: 0 };

  const known = await wikidataLanguages(ids, WIKIDATA_VERIFY_TIMEOUT_MS);
  const checked = ids.filter((id) => known.has(id));
  return {
    mismatched: checked.filter((id) => !matchesLanguage(wanted, known.get(id))),
    checked: checked.length,
    requested: ids.length,
  };
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

    const routes = ["/search", "/discover", "/movie", "/verify"];
    if (request.method !== "GET" || !routes.includes(url.pathname)) {
      return json({ error: "Not found" }, { status: 404 }, corsHeaders);
    }

    if (!env.TVDB_API_KEY) {
      return json({ error: "TVDB_API_KEY is not configured" }, { status: 500 }, corsHeaders);
    }

    const cached = { headers: { "cache-control": "public, max-age=3600" } };
    // An answer where Wikidata did not respond must not be stored for an hour.
    const cacheIf = (complete) => (complete ? cached : { headers: { "cache-control": "no-store" } });

    try {
      if (url.pathname === "/discover") {
        return json({ results: await discoverMovies(url.searchParams, env) }, cached, corsHeaders);
      }

      if (url.pathname === "/verify") {
        const verdict = await verifyLanguage(url.searchParams);
        // Only cache a complete answer; a partial one should be asked again.
        return json(verdict, cacheIf(verdict.checked === verdict.requested), corsHeaders);
      }

      if (url.pathname === "/movie") {
        const id = Number(url.searchParams.get("id"));
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Bad movie id" }, { status: 400 }, corsHeaders);
        const result = await movieDetails(id, env);
        return json({ result }, cacheIf(result.languageChecked), corsHeaders);
      }

      const query = url.searchParams.get("query")?.trim() || "";
      if (query.length < 2 || query.length > 80) {
        return json({ results: [] }, {}, corsHeaders);
      }
      const found = await searchMovies(query, env);
      return json({ results: found.results }, cacheIf(found.complete), corsHeaders);
    } catch {
      return json({ error: "TVDB request failed" }, { status: 502 }, corsHeaders);
    }
  },
};
