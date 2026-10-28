import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demoCandidates, moods } from "./demoData";
import { getCachedMovieSuggestions, hasMovieProxy, searchMovies, type SearchKind } from "./movieSearch";
import {
  displayNameFor,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  updatePassword,
  useAuth,
} from "./auth";
import { CloudRoomModal } from "./CloudRoomModal";
import { useCloudMovies, useCloudRoom } from "./cloudData";
import { hasSupabase } from "./supabaseClient";
import { Modal } from "./Modal";
import { APP_NAME, APP_TAGLINE } from "./brand";
import { DiscoverView } from "./DiscoverView";
import {
  ALL_YEARS,
  CURRENT_YEAR,
  DISCOVER_LANGUAGES,
  FIRST_YEAR,
  MAX_GENRES,
  fetchMovieInfo,
  languageName,
} from "./discover";
import { ChipSelect } from "./ChipSelect";
import { EmptyState } from "./EmptyState";
import { FiltersSheet } from "./FiltersSheet";
import { listSummary, yearSummary } from "./filterText";
import { altTitle, cardMeta, isSameItem, lengthText, titleKey, titleMeta } from "./titles";
import { normalizeTrailerUrl } from "./trailers";
import { Avatar } from "./Avatar";
import { GuestWatchlist } from "./GuestWatchlist";
import { ProfilePage } from "./ProfilePage";
import { HistoryIcon, ProfileIcon, TabDock, TonightIcon, WatchlistIcon } from "./TabDock";
import { TrailerButton } from "./TrailerButton";
import { PickWindow } from "./PickWindow";
import { usePickWindow } from "./usePickWindow";
import { RouletteStage } from "./RouletteStage";
import { SegmentedToggle } from "./SegmentedToggle";
import { SplashScreen } from "./SplashScreen";
import { YearRange } from "./YearRange";
import { rememberRelease, useReleaseStatus } from "./release";
import { isUpcomingCandidate, releaseLabel } from "./releaseDates";
import { useInstallPrompt } from "./useInstallPrompt";
import { useSwipeNavigation } from "./useSwipeNavigation";
import { useRoulette } from "./useRoulette";
import type { Member, MemberId, Mood, Movie, MovieCandidate, RouletteFilters, TasteProfile } from "./types";

const moodLabels: Record<Mood, string> = {
  cozy: "Cozy",
  funny: "Funny",
  romantic: "Romantic",
  tense: "Tense",
  scary: "Scary",
  weird: "Weird",
  "low-effort": "Low-effort",
};

const todayIso = () => new Date().toISOString();

// v3: saved films are looked at once more so a trailer in the wrong language can be replaced.
// v4: everything is looked at once more so series get repaired: before 0.1.39 the app
// looked every saved title up as a film, and a film can share a series' TVDB id (the
// series "Down the Road" got the Hindi film "Bhool Bhulaiyaa 3"'s English title,
// language and IMDb link).
const LANGUAGE_CHECK_KEY = "movie-night-roulette:movie-info-checked-v4";

const readCheckedLanguages = () => {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(LANGUAGE_CHECK_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
};

type TonightMode = "recommendation" | "roulette" | "discover";
const TONIGHT_MODE_KEY = "two-seats:tonight-mode";
const tonightModes: { value: TonightMode; label: string }[] = [
  { value: "recommendation", label: "Recommendation" },
  { value: "roulette", label: "Roulette" },
  { value: "discover", label: "Discover" },
];

// Remembers which of the three Tonight views the person last used on this device.
const readTonightMode = (): TonightMode => {
  try {
    const saved = window.localStorage.getItem(TONIGHT_MODE_KEY);
    return tonightModes.some((mode) => mode.value === saved) ? (saved as TonightMode) : "recommendation";
  } catch {
    return "recommendation";
  }
};

const writeCheckedLanguages = (ids: Set<string>) => {
  try {
    window.localStorage.setItem(LANGUAGE_CHECK_KEY, JSON.stringify([...ids]));
  } catch {
    // Not critical: the check simply repeats on the next visit.
  }
};

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "Not watched yet";

const memberNameOf = (members: Member[], id: MemberId) =>
  members.find((member) => member.id === id)?.displayName ?? "Someone";

const averageRating = (movie: Movie) => {
  const scores = Object.values(movie.ratings).map((rating) => rating?.score).filter((score): score is number => Boolean(score));
  if (!scores.length) return undefined;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
};

// A rating average is only "final" once everyone in the room has rated.
const ratingProgress = (movie: Movie, members: Member[]) => {
  const waiting = members.filter((member) => !movie.ratings[member.id]);
  return { complete: waiting.length === 0, waitingFor: waiting.map((member) => member.displayName) };
};

const ratingLine = (movie: Movie, members: Member[]) => {
  const scores = members.map((member) => `${member.displayName}: ${movie.ratings[member.id]?.score ?? "-"}`).join(" / ");
  const avg = averageRating(movie);
  if (!avg) return scores;
  return `${scores} • Avg ${avg.toFixed(1)}${ratingProgress(movie, members).complete ? "" : "*"}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const calculateTasteProfile = (movies: Movie[]): TasteProfile => {
  const watched = movies.filter((movie) => movie.status === "watched");
  if (!watched.length) {
    return { favoriteGenres: [], topMoods: [], preferredRuntime: 110, watchedCount: 0 };
  }

  const genreScores = new Map<string, number>();
  const moodScores = new Map<Mood, number>();
  // Film length and episode length are kept apart: averaging them would describe neither.
  let weightedRuntime = 0;
  let filmWeight = 0;
  let weightedEpisode = 0;
  let episodeWeight = 0;

  watched.forEach((movie) => {
    const weight = averageRating(movie) ?? 6;
    if (movie.kind === "series") {
      if (movie.runtime > 0) {
        episodeWeight += weight;
        weightedEpisode += movie.runtime * weight;
      }
    } else {
      filmWeight += weight;
      weightedRuntime += movie.runtime * weight;
    }
    movie.genres.forEach((genre) => genreScores.set(genre, (genreScores.get(genre) ?? 0) + weight));
    movie.moods.forEach((mood) => moodScores.set(mood, (moodScores.get(mood) ?? 0) + weight));
  });

  return {
    favoriteGenres: [...genreScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([genre]) => genre),
    topMoods: [...moodScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mood]) => mood),
    preferredRuntime: filmWeight ? Math.round(weightedRuntime / filmWeight) : 110,
    preferredEpisodeRuntime: episodeWeight ? Math.round(weightedEpisode / episodeWeight) : undefined,
    watchedCount: watched.length,
  };
};

const matchScore = (movie: Movie, profile: TasteProfile) => {
  if (movie.status === "watched") {
    return Math.round((averageRating(movie) ?? 7) * 9);
  }

  if (!profile.watchedCount) {
    // Only a film's length counts against it; an episode length says nothing about the effort.
    const lengthPenalty = movie.kind === "series" ? 0 : Math.max(0, movie.runtime - 130) / 8;
    return clamp(70 + (movie.moods.includes("low-effort") ? 8 : 0) - lengthPenalty, 52, 91);
  }

  const genreHits = movie.genres.filter((genre) => profile.favoriteGenres.includes(genre)).length;
  const moodHits = movie.moods.filter((mood) => profile.topMoods.includes(mood)).length;
  // A film is compared with the lengths of films you liked, a series with the episode lengths of
  // series you liked (a neutral middle value until a series has been finished).
  const preferred = movie.kind === "series" ? profile.preferredEpisodeRuntime : profile.preferredRuntime;
  const runtimeFit = preferred && movie.runtime > 0 ? Math.max(0, 16 - Math.abs(movie.runtime - preferred) / 4) : 8;
  const freshness = movie.addedAt ? Math.max(0, 5 - (Date.now() - new Date(movie.addedAt).getTime()) / 86400000 / 6) : 0;

  return Math.round(clamp(58 + genreHits * 8 + moodHits * 6 + runtimeFit + freshness, 45, 98));
};

// The full span of years means "any year", so movies with no usable year still match.
const inYearRange = (year: string, from: number, to: number) => {
  if (from <= FIRST_YEAR && to >= CURRENT_YEAR) return true;
  const value = Number(year);
  return Number.isFinite(value) && value >= from && value <= to;
};

const DEFAULT_ROULETTE_FILTERS: RouletteFilters = {
  type: "all",
  maxRuntime: 150,
  genres: [],
  language: "any",
  moods: [],
  yearFrom: FIRST_YEAR,
  yearTo: CURRENT_YEAR,
  onlyUnwatched: true,
};

// Films that are not out yet are never picked, whatever the filters say.
const filterMovies = (movies: Movie[], filters: RouletteFilters, isUnreleased: (movie: Movie) => boolean) =>
  movies.filter((movie) => {
    if (isUnreleased(movie)) return false;
    if (filters.onlyUnwatched && movie.status !== "unwatched") return false;
    if (filters.type !== "all" && movie.kind !== filters.type) return false;
    // The length filter is for films; a series' episode length is not comparable.
    if (movie.kind !== "series" && movie.runtime > filters.maxRuntime) return false;
    if (filters.genres.length && !movie.genres.some((genre) => filters.genres.includes(genre))) return false;
    if (filters.language !== "any" && movie.language !== filters.language) return false;
    if (filters.moods.length && !movie.moods.some((mood) => filters.moods.includes(mood))) return false;
    if (!inYearRange(movie.year, filters.yearFrom, filters.yearTo)) return false;
    return true;
  });

type WatchStatusFilter = "any" | "watched" | "unwatched" | "unreleased";
type WatchlistSort =
  | "added-desc"
  | "added-asc"
  | "title-asc"
  | "match-desc"
  | "runtime-asc"
  | "runtime-desc"
  | "year-desc"
  | "year-asc";

const watchlistSortOptions: WatchlistSort[] = [
  "added-desc",
  "added-asc",
  "title-asc",
  "match-desc",
  "runtime-asc",
  "runtime-desc",
  "year-desc",
  "year-asc",
];

const sortLabels: Record<WatchlistSort, string> = {
  "added-desc": "Date added (newest)",
  "added-asc": "Date added (oldest)",
  "title-asc": "Title (A–Z)",
  "match-desc": "Match %",
  "runtime-asc": "Runtime (shortest)",
  "runtime-desc": "Runtime (longest)",
  "year-desc": "Year (newest)",
  "year-asc": "Year (oldest)",
};

const sortWatchlist = (movies: Movie[], sort: WatchlistSort, profile: TasteProfile) => {
  const sorted = [...movies];
  switch (sort) {
    case "added-asc":
      return sorted.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
    case "title-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "match-desc":
      return sorted.sort((a, b) => matchScore(b, profile) - matchScore(a, profile));
    // Runtime means a film's length; a series (episode length) goes after the films either way.
    case "runtime-asc":
      return sorted.sort((a, b) => Number(a.kind === "series") - Number(b.kind === "series") || a.runtime - b.runtime);
    case "runtime-desc":
      return sorted.sort((a, b) => Number(a.kind === "series") - Number(b.kind === "series") || b.runtime - a.runtime);
    case "year-desc":
      return sorted.sort((a, b) => Number(b.year) - Number(a.year));
    case "year-asc":
      return sorted.sort((a, b) => Number(a.year) - Number(b.year));
    case "added-desc":
    default:
      return sorted.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }
};

const DEFAULT_WATCHLIST_MAX_RUNTIME = 300;

type WatchTypeFilter = "all" | "movie" | "series";

type WatchlistFilters = {
  type: WatchTypeFilter;
  genres: string[];
  language: string;
  yearFrom: number;
  yearTo: number;
  status: WatchStatusFilter;
  maxRuntime: number;
  sort: WatchlistSort;
};

const DEFAULT_WATCHLIST_FILTERS: WatchlistFilters = {
  type: "all",
  genres: [],
  language: "any",
  yearFrom: FIRST_YEAR,
  yearTo: CURRENT_YEAR,
  status: "any",
  maxRuntime: DEFAULT_WATCHLIST_MAX_RUNTIME,
  sort: "added-desc",
};

type View = "tonight" | "watchlist" | "history" | "profile";
// In page order: a section slides in from the side it is on. History is a page
// inside Watchlist (opened from the clock at the top right).
const views: View[] = ["tonight", "watchlist", "history", "profile"];
// The sections in the bottom bar.
type DockView = "tonight" | "watchlist" | "profile";
const dockViews: DockView[] = ["tonight", "watchlist", "profile"];
const dockViewFor = (view: View): DockView => (view === "history" ? "watchlist" : view);
const viewLabels: Record<View, string> = {
  tonight: "Tonight",
  watchlist: "Watchlist",
  history: "History",
  profile: "Profile",
};
const dockIcons: Record<DockView, ReactNode> = {
  tonight: <TonightIcon />,
  watchlist: <WatchlistIcon />,
  profile: <ProfileIcon />,
};


const viewFromHash = (): View => {
  const hash = window.location.hash.replace("#", "");
  return (views as string[]).includes(hash) ? (hash as View) : "tonight";
};

function App() {
  const [view, setView] = useState<View>(() => viewFromHash());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieCandidate[]>([]);
  const [searchKind, setSearchKind] = useState<SearchKind>("any");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, loading: authLoading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const cloud = useCloudRoom(user?.id);
  const cloudActive = Boolean(user && cloud.room);
  const cloudMovies = useCloudMovies(user && cloud.room ? cloud.room.id : null);
  const [actionError, setActionError] = useState("");
  // The splash is skipped for people who ask their device to reduce motion.
  const [splashDone, setSplashDone] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const installApp = useInstallPrompt();
  const showSetup = Boolean(user) && !cloud.room;
  const myName = user ? (cloud.members.find((member) => member.userId === user.id)?.displayName ?? displayNameFor(user)) : "";
  const movies = cloudMovies.movies;
  const release = useReleaseStatus(movies, cloudActive);
  const members = useMemo<Member[]>(
    () => cloud.members.map((member) => ({ id: member.userId, displayName: member.displayName })),
    [cloud.members],
  );

  useEffect(() => {
    if (passwordRecovery) setAccountOpen(true);
  }, [passwordRecovery]);
  const [trailerMovie, setTrailerMovie] = useState<{ title: string; trailerUrl?: string } | null>(null);
  const [ratingMovie, setRatingMovie] = useState<Movie | null>(null);
  const [viewMovieId, setViewMovieId] = useState<string | null>(null);
  const [tonightMode, setTonightModeState] = useState<TonightMode>(readTonightMode);
  // Discover keeps its filters, list and pick while you look at the other modes and the
  // other sections (Watchlist, History), so it is built on first visit and then only hidden.
  const [discoverVisited, setDiscoverVisited] = useState(false);
  const setTonightMode = (mode: TonightMode) => {
    setTonightModeState(mode);
    try {
      window.localStorage.setItem(TONIGHT_MODE_KEY, mode);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };
  const [filters, setFilters] = useState<RouletteFilters>(DEFAULT_ROULETTE_FILTERS);
  const [watchlistFilters, setWatchlistFilters] = useState<WatchlistFilters>(DEFAULT_WATCHLIST_FILTERS);

  // Signed out, Watchlist and Profile open greyed-out previews; History is not
  // reachable. Wait for the session check first so a signed-in person opening
  // #history is not bounced to Tonight.
  const activeView: View = user || authLoading || view !== "history" ? view : "tonight";

  // The section slides in from the side it is on (not for reduced motion, nor the first load).
  const mainRef = useRef<HTMLElement>(null);
  const shownView = useRef<View>(activeView);
  useEffect(() => {
    const previous = shownView.current;
    shownView.current = activeView;
    const main = mainRef.current;
    if (previous === activeView || !main || typeof main.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = views.indexOf(activeView) > views.indexOf(previous) ? 28 : -28;
    main.animate(
      [
        { opacity: 0, transform: `translateX(${from}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [activeView]);

  useEffect(() => {
    if (user && activeView === "tonight" && tonightMode === "discover") setDiscoverVisited(true);
  }, [user, activeView, tonightMode]);

  // Swiping sideways moves between the sections in the bottom bar (only when signed in).
  const swipe = useSwipeNavigation((direction) => {
    if (!user) return;
    const next = dockViews[dockViews.indexOf(dockViewFor(activeView)) + direction];
    if (next) setView(next);
  });

  useEffect(() => {
    if (window.location.hash.replace("#", "") !== activeView) {
      window.location.hash = activeView;
    }
  }, [activeView]);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    const instantSuggestions = hasMovieProxy
      ? getCachedMovieSuggestions(trimmed, searchKind)
      : demoCandidates.filter((movie) => movie.title.toLowerCase().includes(trimmed.toLowerCase()));
    setSearchResults(instantSuggestions);
    setSearchError("");

    let active = true;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        if (hasMovieProxy) {
          const proxyResults = await searchMovies(trimmed, searchKind);
          if (active) {
            const mergedResults = [...proxyResults, ...getCachedMovieSuggestions(trimmed, searchKind)].filter(
              (movie, index, all) =>
                all.findIndex((item) => item.tvdbId === movie.tvdbId && item.kind === movie.kind && item.title === movie.title) === index,
            );
            setSearchResults(mergedResults.slice(0, 8));
          }
        } else {
          const demoResults = demoCandidates.filter((movie) => movie.title.toLowerCase().includes(trimmed.toLowerCase()));
          if (active) setSearchResults(demoResults);
        }
      } catch {
        const fallback = demoCandidates.filter((movie) => movie.title.toLowerCase().includes(trimmed.toLowerCase()));
        if (active) {
          setSearchResults(fallback);
          setSearchError("Search stumbled, so demo picks are showing instead.");
        }
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query, movies, searchKind]);

  const genres = useMemo(
    () => [...new Set(movies.flatMap((movie) => movie.genres))].sort((a, b) => a.localeCompare(b)),
    [movies],
  );
  const languages = useMemo(
    () =>
      [...new Set(movies.map((movie) => movie.language).filter((code): code is string => Boolean(code)))].sort((a, b) =>
        languageName(a).localeCompare(languageName(b)),
      ),
    [movies],
  );
  const profile = useMemo(() => calculateTasteProfile(movies), [movies]);
  // Sorting is not a filter, so it does not count as "filtering" the list.
  const watchlistFiltersActive =
    watchlistFilters.type !== "all" ||
    watchlistFilters.genres.length > 0 ||
    watchlistFilters.language !== "any" ||
    watchlistFilters.yearFrom > FIRST_YEAR ||
    watchlistFilters.yearTo < CURRENT_YEAR ||
    watchlistFilters.status !== "any" ||
    watchlistFilters.maxRuntime !== DEFAULT_WATCHLIST_MAX_RUNTIME;
  const filteredWatchlist = useMemo(() => {
    const f = watchlistFilters;
    const filtered = movies.filter((movie) => {
      if (f.type !== "all" && movie.kind !== f.type) return false;
      if (f.genres.length && !movie.genres.some((genre) => f.genres.includes(genre))) return false;
      if (f.language !== "any" && movie.language !== f.language) return false;
      if (!inYearRange(movie.year, f.yearFrom, f.yearTo)) return false;
      if (f.status === "unreleased") {
        if (!release.isUnreleased(movie)) return false;
      } else if (f.status !== "any" && movie.status !== f.status) return false;
      // The length filter is for films; a series' episode length is not comparable.
      if (movie.kind !== "series" && movie.runtime > f.maxRuntime) return false;
      return true;
    });
    return sortWatchlist(filtered, f.sort, profile);
  }, [movies, watchlistFilters, profile, release]);
  const watchlistSummary = [
    watchlistFilters.type === "all" ? "Movies and series" : watchlistFilters.type === "movie" ? "Movies only" : "Series only",
    watchlistFilters.language === "any" ? "Any language" : languageName(watchlistFilters.language),
    yearSummary(watchlistFilters.yearFrom, watchlistFilters.yearTo, FIRST_YEAR, CURRENT_YEAR),
    listSummary(watchlistFilters.genres, "Any genre"),
    watchlistFilters.status === "any"
      ? "Any status"
      : watchlistFilters.status === "watched"
        ? "Watched"
        : watchlistFilters.status === "unreleased"
          ? "Not out yet"
          : "Unwatched",
    watchlistFilters.maxRuntime >= DEFAULT_WATCHLIST_MAX_RUNTIME ? "Any length" : `Up to ${watchlistFilters.maxRuntime} min`,
    `Sort: ${sortLabels[watchlistFilters.sort]}`,
  ].join(" · ");
  const moviesByMatch = useMemo(
    () =>
      movies
        .filter((movie) => movie.status === "unwatched" && !release.isUnreleased(movie))
        .sort((a, b) => matchScore(b, profile) - matchScore(a, profile)),
    [movies, profile, release],
  );
  const bestTonight = moviesByMatch[0];
  const rouletteMovies = useMemo(
    () => filterMovies(movies, filters, release.isUnreleased).sort((a, b) => matchScore(b, profile) - matchScore(a, profile)),
    [movies, filters, profile, release],
  );
  const roulette = useRoulette(rouletteMovies);
  const selectedMovie = roulette.selectedId ? movies.find((movie) => movie.id === roulette.selectedId) : undefined;
  const pick = usePickWindow(roulette.selectedId);
  const viewMovie = viewMovieId ? movies.find((movie) => movie.id === viewMovieId) : undefined;
  const watchedMovies = useMemo(
    () =>
      movies
        .filter((movie) => movie.status === "watched")
        .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime()),
    [movies],
  );
  const unwatchedCount = movies.length - watchedMovies.length;

  const rouletteSummary = [
    filters.type === "all" ? "Movies and series" : filters.type === "movie" ? "Movies only" : "Series only",
    filters.language === "any" ? "Any language" : languageName(filters.language),
    yearSummary(filters.yearFrom, filters.yearTo, FIRST_YEAR, CURRENT_YEAR),
    filters.type === "series" ? "" : `Movies up to ${filters.maxRuntime} min`,
    listSummary(filters.genres, "Any genre"),
    listSummary(filters.moods.map((mood) => moodLabels[mood]), "Any mood"),
    filters.onlyUnwatched ? "Unwatched only" : "Watched too",
  ]
    .filter(Boolean)
    .join(" · ");

  // Each saved TVDB movie is checked once per device: the movie service fills in
  // a missing original language, corrects a wrong one, and supplies the English
  // title to show small under a foreign film's own title.
  const checkedLanguages = useRef(readCheckedLanguages());
  const triedLanguages = useRef(new Set<string>());
  const { movies: savedMovies, updateInfo } = cloudMovies;
  useEffect(() => {
    if (!cloudActive) return;
    const pending = savedMovies.filter(
      (movie) => movie.tvdbId && !checkedLanguages.current.has(movie.id) && !triedLanguages.current.has(movie.id),
    );
    if (!pending.length) return;
    pending.forEach((movie) => triedLanguages.current.add(movie.id));
    (async () => {
      for (const movie of pending) {
        if (!movie.tvdbId) continue;
        const info = await fetchMovieInfo(movie.tvdbId, movie.kind);
        if (!info.language && !info.englishTitle && !info.imdbId && !info.checked) continue; // Try again on a later visit.

        const patch: {
          language?: string;
          englishTitle?: string | null;
          title?: string;
          imdbId?: string | null;
          trailerUrl?: string | null;
          seasons?: number;
          seriesStatus?: string;
        } = {};
        // An unconfirmed (TVDB-only) language may fill a gap but never overwrites a stored one.
        if (info.language && info.language !== movie.language && (info.checked || !movie.language)) {
          patch.language = info.language;
        }
        if (info.englishTitle && info.englishTitle !== movie.englishTitle) patch.englishTitle = info.englishTitle;
        if (info.imdbId && info.imdbId !== movie.imdbId) patch.imdbId = info.imdbId;
        if (movie.kind === "series") {
          if (info.seasons && info.seasons !== movie.seasons) patch.seasons = info.seasons;
          if (info.seriesStatus && info.seriesStatus !== movie.seriesStatus) patch.seriesStatus = info.seriesStatus;
          // A full answer about the series is the final word: anything it does not have
          // (an English title, an IMDb link, a trailer) was picked up from a film with the
          // same id, so it is cleared.
          if (info.checked && info.title) {
            if ((info.englishTitle ?? null) !== (movie.englishTitle ?? null)) patch.englishTitle = info.englishTitle ?? null;
            if ((info.imdbId ?? null) !== (movie.imdbId ?? null)) patch.imdbId = info.imdbId ?? null;
            if ((info.trailerUrl ?? null) !== (movie.trailerUrl ?? null)) patch.trailerUrl = info.trailerUrl ?? null;
          }
        }
        // Swap in an English trailer when the saved one is something else (e.g. French).
        if (info.trailerUrl && /^en/i.test(info.trailerLanguage ?? "") && info.trailerUrl !== movie.trailerUrl) {
          patch.trailerUrl = info.trailerUrl;
        }
        // Saved under its English name but the film has its own: use the film's own.
        if (info.title && info.englishTitle && titleKey(movie.title) === titleKey(info.englishTitle) && titleKey(info.title) !== titleKey(movie.title)) {
          patch.title = info.title;
        }
        if (Object.keys(patch).length) await updateInfo(movie.id, patch);

        if (!info.checked) continue; // Language not confirmed yet: look again on a later visit.
        checkedLanguages.current.add(movie.id);
        writeCheckedLanguages(checkedLanguages.current);
      }
    })();
  }, [cloudActive, savedMovies, updateInfo]);

  const reportFailure = (result: { ok: true } | { ok: false; message: string }) => {
    if (!result.ok) setActionError(result.message);
  };

  const updateMovie = (movieId: string, updater: (movie: Movie) => Movie) => {
    const current = movies.find((movie) => movie.id === movieId);
    if (!current) return;
    const next = updater(current);
    if (next.status !== current.status || next.watchedAt !== current.watchedAt) {
      setActionError("");
      cloudMovies.setStatus(movieId, next.status, next.watchedAt).then(reportFailure);
    }
  };

  const addMovie = (candidate: MovieCandidate) => {
    const exists = movies.some((movie) => isSameItem(movie, candidate));
    if (exists) {
      setSearchError("That one is already on your couch list.");
      return;
    }
    if (!user) return;

    setActionError("");
    rememberRelease(candidate);
    cloudMovies.add(candidate, user.id).then((result) => {
      reportFailure(result);
      if (result.ok) {
        setQuery("");
        setSearchResults([]);
      }
    });
  };

  const removeMovie = (movieId: string, onRemoved?: () => void) => {
    const movie = movies.find((item) => item.id === movieId);
    if (!movie) return;
    if (!window.confirm(`Remove "${movie.title}" from the watchlist? This also deletes its ratings and history.`)) {
      return;
    }
    setActionError("");
    onRemoved?.();
    cloudMovies.remove(movieId).then(reportFailure);
  };

  return (
    <div className={activeView === "tonight" ? "app-shell fit-screen" : "app-shell"} inert={!splashDone} {...swipe}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="11" y="16" width="20" height="30" rx="7" fill="var(--accent)" />
            <rect x="33" y="16" width="20" height="30" rx="7" fill="none" stroke="var(--accent)" strokeWidth="3.5" />
            <rect x="11" y="49" width="42" height="4" rx="2" fill="var(--accent)" opacity="0.45" />
          </svg>
          <div>
            <h1 className="wordmark">{APP_NAME}</h1>
            <p className="room-name">{user ? (cloud.room?.name ?? "Set up your room") : APP_TAGLINE}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {hasSupabase && !user && activeView === "tonight" && (
            <button className="signin-button" onClick={() => setAccountOpen(true)}>
              Sign in
            </button>
          )}
          {user && activeView === "tonight" && (
            <button type="button" className="profile-button" onClick={() => setView("profile")}>
              <span className="profile-name">{myName}</span>
              <Avatar size={32} />
            </button>
          )}
          {user && (activeView === "watchlist" || activeView === "history") && (
            <button
              type="button"
              className={activeView === "history" ? "history-button active" : "history-button"}
              aria-label={activeView === "history" ? "Back to the watchlist" : "History"}
              aria-pressed={activeView === "history"}
              onClick={() => setView(activeView === "history" ? "watchlist" : "history")}
            >
              <HistoryIcon />
            </button>
          )}
        </div>
      </header>

      <main
        ref={mainRef}
        className={activeView === "profile" ? "view profile-view" : "view"}
        aria-label={`${viewLabels[activeView]} view`}
      >
        {actionError && (
          <p className="auth-message error" role="alert">
            {actionError}
          </p>
        )}
        {!user && !authLoading && (
          <div className="tonight-fill" hidden={activeView !== "tonight"}>
            <DiscoverView
              onSignIn={hasSupabase ? () => setAccountOpen(true) : undefined}
              onTrailer={setTrailerMovie}
            />
          </div>
        )}
        {showSetup && activeView !== "profile" && (
          <section className="panel setup-panel">
            <h2>{cloud.loading ? "Loading your room..." : "Set up your room"}</h2>
            {!cloud.loading && (
              <>
                <p>Create a room, or join your partner's with an invite code, to start your shared watchlist.</p>
                {cloud.error && <p className="auth-message error">{cloud.error}</p>}
                <button className="primary-button" onClick={() => setRoomOpen(true)}>
                  Set up room
                </button>
              </>
            )}
          </section>
        )}
        {cloudActive && cloudMovies.error && <p className="auth-message error">{cloudMovies.error}</p>}
        {user && !showSetup && activeView === "tonight" && (
          <>
            <AddMovieBar
              movies={movies}
              query={query}
              setQuery={setQuery}
              searchLoading={searchLoading}
              searchError={searchError}
              searchResults={searchResults}
              onManual={() => setManualOpen(true)}
              onAdd={addMovie}
              searchKind={searchKind}
              onSearchKind={setSearchKind}
            />

            <SegmentedToggle
              label="Tonight"
              options={tonightModes}
              value={tonightMode}
              onChange={setTonightMode}
            />

            {tonightMode === "recommendation" && (
              <div className="tonight-main">
                <p className="room-status">
                  {unwatchedCount} maybes · {watchedMovies.length} watched
                </p>

                {bestTonight ? (
                  // Tapping the card opens the movie's details, like the Watchlist cards.
                  <article
                    className="best-card"
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest("button, a")) setViewMovieId(bestTonight.id);
                    }}
                  >
                    <img src={bestTonight.posterUrl} alt="" />
                    <div className="best-body">
                      <h2>Best for us tonight</h2>
                      <h3>{bestTonight.title}</h3>
                      <p>
                        <span className={bestTonight.kind === "series" ? "kind-pill" : "kind-pill movie"}>
                          {bestTonight.kind === "series" ? "Series" : "Movie"}
                        </span>
                        {[lengthText(bestTonight), bestTonight.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
                      </p>
                      <span className="score">{matchScore(bestTonight, profile)}% match</span>
                      <button className="best-view" onClick={() => setViewMovieId(bestTonight.id)}>
                        View
                      </button>
                    </div>
                  </article>
                ) : (
                  <EmptyState
                    title={cloudActive ? "Your watchlist is empty" : "The list is waiting"}
                    body={
                      cloudActive
                        ? "Search above to add your first movie or series. Your partner will see it too."
                        : "Add a few movies or series and the app will start learning what works for both of you."
                    }
                  />
                )}
              </div>
            )}

            {tonightMode === "roulette" && (
              <section className="panel roulette-panel">
                <div className="section-heading">
                  <h2>Let the room choose</h2>
                  <span>{rouletteMovies.length} eligible</span>
                </div>

                <FiltersSheet
                  applied={filters}
                  defaults={DEFAULT_ROULETTE_FILTERS}
                  onApply={setFilters}
                  summary={rouletteSummary}
                  disabled={roulette.spinning}
                >
                  {(draft, change) => (
                    <div className="filters">
                      <label>
                        Type
                        <select
                          value={draft.type}
                          onChange={(event) => change({ type: event.target.value as RouletteFilters["type"] })}
                        >
                          <option value="all">Movies and series</option>
                          <option value="movie">Movies only</option>
                          <option value="series">Series only</option>
                        </select>
                      </label>
                      <label>
                        Language
                        <select value={draft.language} onChange={(event) => change({ language: event.target.value })}>
                          <option value="any">Any language</option>
                          {languages.map((code) => (
                            <option key={code} value={code}>
                              {languageName(code)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={draft.onlyUnwatched}
                          onChange={(event) => change({ onlyUnwatched: event.target.checked })}
                        />
                        Only unwatched
                      </label>
                      <YearRange
                        from={draft.yearFrom}
                        to={draft.yearTo}
                        years={ALL_YEARS}
                        onChange={(yearFrom, yearTo) => change({ yearFrom, yearTo })}
                      />
                      <label>
                        Max runtime (movies only)
                        <input
                          type="range"
                          min="80"
                          max="190"
                          step="5"
                          value={draft.maxRuntime}
                          onChange={(event) => change({ maxRuntime: Number(event.target.value) })}
                        />
                        <strong>{draft.maxRuntime} min</strong>
                      </label>
                      <ChipSelect
                        label="Genre"
                        options={genres.map((genre) => ({ value: genre, label: genre }))}
                        selected={draft.genres}
                        max={MAX_GENRES}
                        onChange={(selectedGenres) => change({ genres: selectedGenres })}
                      />
                      <ChipSelect
                        label="Mood"
                        options={moods.map((mood) => ({ value: mood, label: moodLabels[mood] }))}
                        selected={draft.moods}
                        onChange={(selectedMoods) => change({ moods: selectedMoods as Mood[] })}
                      />
                    </div>
                  )}
                </FiltersSheet>


                <div className="roulette-stage" aria-live="polite">
                  {rouletteMovies.length ? (
                    <>
                      <RouletteStage
                        items={rouletteMovies}
                        activeIndex={roulette.activeIndex}
                        spinning={roulette.spinning}
                        selectedId={roulette.selectedId}
                        label={roulette.spinning ? "Choosing..." : "Spin roulette"}
                        disabled={roulette.spinning}
                        onSpin={roulette.spin}
                        secondary={
                          selectedMovie &&
                          !pick.open &&
                          !pick.waiting && (
                            <button type="button" className="view-pick" onClick={pick.show}>
                              View pick
                            </button>
                          )
                        }
                      />
                    </>
                  ) : (
                    <EmptyState title="No titles match" body="Loosen a filter and the roulette wheel will behave itself again." />
                  )}
                </div>

                {selectedMovie && pick.open && (
                  <PickWindow
                    flyFrom=".coverflow.landed .cover-tile.middle img"
                    title={selectedMovie.title}
                    altTitle={altTitle(selectedMovie.title, selectedMovie.englishTitle)}
                    posterUrl={selectedMovie.posterUrl}
                    imdbId={selectedMovie.imdbId}
                    meta={[titleMeta(selectedMovie, " · "), selectedMovie.genres.slice(0, 2).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                    synopsis={selectedMovie.synopsis}
                    onClose={pick.close}
                  >
                    {selectedMovie.trailerUrl && <TrailerButton onClick={() => setTrailerMovie(selectedMovie)} />}
                    <button
                      onClick={() => {
                        pick.close();
                        updateMovie(selectedMovie.id, (movie) => ({
                          ...movie,
                          status: "watched",
                          watchedAt: movie.watchedAt ?? todayIso(),
                        }));
                      }}
                    >
                      {selectedMovie.kind === "series" ? "Mark finished" : "Mark watched"}
                    </button>
                  </PickWindow>
                )}
              </section>
            )}

          </>
        )}

        {user && !showSetup && discoverVisited && (
          <div className="tonight-fill" hidden={activeView !== "tonight" || tonightMode !== "discover"}>
            <DiscoverView
              saved={movies}
              onSave={(candidate) => cloudMovies.add(candidate, user.id)}
              onTrailer={setTrailerMovie}
            />
          </div>
        )}

        {user && !showSetup && activeView === "watchlist" && (
          <>
            <AddMovieBar
              movies={movies}
              query={query}
              setQuery={setQuery}
              searchLoading={searchLoading}
              searchError={searchError}
              searchResults={searchResults}
              onManual={() => setManualOpen(true)}
              onAdd={addMovie}
              searchKind={searchKind}
              onSearchKind={setSearchKind}
            />

            <section className="taste-strip">
              {profile.watchedCount ? (
                <>
                  <span>
                    <strong>Favorite genres</strong> {profile.favoriteGenres.join(", ")}
                  </span>
                  <span>
                    <strong>Preferred runtime</strong> {profile.preferredRuntime} min
                  </span>
                  {profile.preferredEpisodeRuntime && (
                    <span>
                      <strong>Preferred episode length</strong> {profile.preferredEpisodeRuntime} min
                    </span>
                  )}
                  <span>
                    <strong>Top moods</strong> {profile.topMoods.map((mood) => moodLabels[mood]).join(", ")}
                  </span>
                </>
              ) : (
                <span>Rate something you've watched together and this will start learning your taste.</span>
              )}
            </section>

            <FiltersSheet
              applied={watchlistFilters}
              defaults={DEFAULT_WATCHLIST_FILTERS}
              resetTo={(draft) => ({ ...DEFAULT_WATCHLIST_FILTERS, sort: draft.sort })}
              onApply={setWatchlistFilters}
              summary={watchlistSummary}
            >
              {(draft, change) => (
                <div className="filters">
                  <label>
                    Sort by
                    <select value={draft.sort} onChange={(event) => change({ sort: event.target.value as WatchlistSort })}>
                      {watchlistSortOptions.map((option) => (
                        <option key={option} value={option}>
                          {sortLabels[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select value={draft.type} onChange={(event) => change({ type: event.target.value as WatchTypeFilter })}>
                      <option value="all">Movies and series</option>
                      <option value="movie">Movies only</option>
                      <option value="series">Series only</option>
                    </select>
                  </label>
                  <label>
                    Language
                    <select value={draft.language} onChange={(event) => change({ language: event.target.value })}>
                      <option value="any">Any language</option>
                      {languages.map((code) => (
                        <option key={code} value={code}>
                          {languageName(code)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) => change({ status: event.target.value as WatchStatusFilter })}
                    >
                      <option value="any">Any status</option>
                      <option value="unwatched">Unwatched</option>
                      <option value="watched">Watched</option>
                      <option value="unreleased">Not out yet</option>
                    </select>
                  </label>
                  <YearRange
                    from={draft.yearFrom}
                    to={draft.yearTo}
                    years={ALL_YEARS}
                    onChange={(yearFrom, yearTo) => change({ yearFrom, yearTo })}
                  />
                  <label>
                    Max runtime (movies only)
                    <input
                      type="range"
                      min="10"
                      max={DEFAULT_WATCHLIST_MAX_RUNTIME}
                      step="5"
                      value={draft.maxRuntime}
                      onChange={(event) => change({ maxRuntime: Number(event.target.value) })}
                    />
                    <strong>{draft.maxRuntime >= DEFAULT_WATCHLIST_MAX_RUNTIME ? "Any" : `${draft.maxRuntime} min`}</strong>
                  </label>
                  <ChipSelect
                    label="Genre"
                    options={genres.map((genre) => ({ value: genre, label: genre }))}
                    selected={draft.genres}
                    max={MAX_GENRES}
                    onChange={(selectedGenres) => change({ genres: selectedGenres })}
                  />
                </div>
              )}
            </FiltersSheet>

            <section className="watchlist">
              <div className="section-heading">
                <h2>Watchlist</h2>
                <span>
                  {watchlistFiltersActive
                    ? `${filteredWatchlist.length} of ${movies.length} titles`
                    : `${movies.length} ${movies.length === 1 ? "title" : "titles"}`}
                </span>
              </div>
              {movies.length ? (
                filteredWatchlist.length ? (
                  <div className="movie-grid">
                    {filteredWatchlist.map((movie) => (
                      <MovieCard
                        key={movie.id}
                        releaseText={release.releaseText(movie)}
                        movie={movie}
                        score={matchScore(movie, profile)}
                        members={members}
                        onView={() => setViewMovieId(movie.id)}
                        onToggleWatched={() =>
                          updateMovie(movie.id, (current) => ({
                            ...current,
                            status: current.status === "watched" ? "unwatched" : "watched",
                            watchedAt: current.status === "watched" ? undefined : todayIso(),
                          }))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No matches" body="Try loosening a filter to see more of your watchlist." />
                )
              ) : (
                <EmptyState
                  title={cloudActive ? "Your watchlist is empty" : "No maybes yet"}
                  body={
                    cloudActive
                      ? "Search above to add your first movie or series. Your partner will see it too."
                      : "Start with one comfort pick and one wild card. That is usually enough to get moving."
                  }
                />
              )}
            </section>
          </>
        )}

        {user && !showSetup && activeView === "history" && (
          <section className="panel history-panel">
            <div className="section-heading">
              <h2>History</h2>
              <span>
                {watchedMovies.length} {watchedMovies.length === 1 ? "title" : "titles"}
              </span>
            </div>
            {watchedMovies.length ? (
              <div className="history-list">
                {watchedMovies.map((movie) => (
                  <article key={movie.id}>
                    <img src={movie.posterUrl} alt="" />
                    <div>
                      <h3>{movie.title}</h3>
                      {altTitle(movie.title, movie.englishTitle) && (
                        <small className="alt-title">({altTitle(movie.title, movie.englishTitle)})</small>
                      )}
                      <p>
                        <span className={movie.kind === "series" ? "kind-pill" : "kind-pill movie"}>
                          {movie.kind === "series" ? "Series" : "Movie"}
                        </span>
                        {movie.kind === "series" ? "Finished " : ""}
                        {formatDate(movie.watchedAt)} • Added by {memberNameOf(members, movie.addedBy)}
                      </p>
                      {movie.kind === "series" && <small>{titleMeta(movie)}</small>}
                      <small>{ratingLine(movie, members)}</small>
                      {members
                        .filter((member) => movie.ratings[member.id]?.note)
                        .map((member) => (
                          <small key={member.id} className="history-note">
                            {member.displayName}: “{movie.ratings[member.id]?.note}”
                          </small>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No history yet" body="Once a pick survives the couch vote, it will live here." />
            )}
          </section>
        )}

        {!user && !authLoading && activeView === "watchlist" && (
          <GuestWatchlist onSignIn={hasSupabase ? () => setAccountOpen(true) : undefined} />
        )}

        {activeView === "profile" && !authLoading && (
          <ProfilePage
            name={user ? myName : undefined}
            email={user?.email ?? ""}
            onRoomSettings={() => setRoomOpen(true)}
            onSignOut={() => void signOut()}
            onSignIn={hasSupabase ? () => setAccountOpen(true) : undefined}
            install={installApp}
          />
        )}
      </main>

      <TabDock
        items={dockViews.map((item) => ({ id: item, label: viewLabels[item], icon: dockIcons[item] }))}
        active={dockViewFor(activeView)}
        onSelect={(item) => setView(item as View)}
      />

      {manualOpen && <ManualMovieModal onClose={() => setManualOpen(false)} onAdd={addMovie} />}
      {accountOpen && (
        <AccountModal
          recovering={passwordRecovery}
          onClose={() => {
            setAccountOpen(false);
            clearPasswordRecovery();
          }}
        />
      )}
      {roomOpen && user && (
        <CloudRoomModal
          userId={user.id}
          defaultName={displayNameFor(user)}
          room={cloud.room}
          members={cloud.members}
          loading={cloud.loading}
          error={cloud.error}
          refresh={cloud.refresh}
          onClose={() => setRoomOpen(false)}
        />
      )}
      {!splashDone && <SplashScreen ready={!authLoading} onDone={finishSplash} />}
      {viewMovie && (
        <PickWindow
          heading={viewMovie.kind === "series" ? "Series details" : "Movie details"}
          title={viewMovie.title}
          altTitle={altTitle(viewMovie.title, viewMovie.englishTitle)}
          posterUrl={viewMovie.posterUrl}
          imdbId={viewMovie.imdbId}
          meta={titleMeta(viewMovie, " · ")}
          details={
            <div className="view-details">
              {release.releaseText(viewMovie) && (
                <p className="upcoming-note">
                  Not out yet ({release.releaseText(viewMovie)}). It stays off the roulette and recommendations until it is released.
                </p>
              )}
              {viewMovie.genres.length > 0 && <p className="chip-row">{viewMovie.genres.join(" · ")}</p>}
              <RatingSummary movie={viewMovie} members={members} />
              <p className="meta-row">
                <span>Added by {memberNameOf(members, viewMovie.addedBy)}</span>
                {viewMovie.language && <span>{languageName(viewMovie.language)}</span>}
                {viewMovie.moods.length > 0 && <span>{viewMovie.moods.map((mood) => moodLabels[mood]).join(", ")}</span>}
              </p>
            </div>
          }
          synopsis={viewMovie.synopsis}
          onClose={() => setViewMovieId(null)}
        >
          <button className="primary-button" onClick={() => setRatingMovie(viewMovie)}>
            Rate
          </button>
          {normalizeTrailerUrl(viewMovie.trailerUrl) && <TrailerButton onClick={() => setTrailerMovie(viewMovie)} />}
          <button
            className="remove-button"
            onClick={() => {
              const id = viewMovie.id;
              removeMovie(id, () => setViewMovieId(null));
            }}
          >
            Remove
          </button>
        </PickWindow>
      )}
      {trailerMovie && <TrailerModal movie={trailerMovie} onClose={() => setTrailerMovie(null)} />}
      {ratingMovie && (
        <RatingModal
          members={members}
          currentMemberId={user?.id}
          movie={movies.find((movie) => movie.id === ratingMovie.id) ?? ratingMovie}
          onClose={() => setRatingMovie(null)}
          onSave={(movieId, _partner, score, note) => {
            if (!user) return;
            const existing = movies.find((movie) => movie.id === movieId);
            setActionError("");
            cloudMovies.saveRating(movieId, user.id, score, note).then(async (result) => {
              reportFailure(result);
              if (result.ok && existing && existing.status !== "watched") {
                reportFailure(await cloudMovies.setStatus(movieId, "watched", existing.watchedAt ?? todayIso()));
              }
            });
          }}
        />
      )}
    </div>
  );
}

type AddMovieBarProps = {
  movies: Movie[];
  query: string;
  setQuery: (value: string) => void;
  searchLoading: boolean;
  searchError: string;
  searchResults: MovieCandidate[];
  onManual: () => void;
  onAdd: (candidate: MovieCandidate) => void;
  searchKind: SearchKind;
  onSearchKind: (kind: SearchKind) => void;
};

const searchKinds: { value: SearchKind; label: string }[] = [
  { value: "any", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
];

function AddMovieBar({
  movies,
  query,
  setQuery,
  searchLoading,
  searchError,
  searchResults,
  onManual,
  onAdd,
  searchKind,
  onSearchKind,
}: AddMovieBarProps) {
  return (
    <section className="search-shell" aria-label="Add a movie or series">
      <div className="search-field">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.6" />
          <line x1="13.6" y1="13.6" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a movie or series to add" />
        {query && (
          <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>
      {query && (
        <div className="search-dropdown">
          <div className="dropdown-head">
            {hasMovieProxy && (
              <div className="kind-tabs" role="group" aria-label="Look for">
                {searchKinds.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={searchKind === option.value}
                    className={searchKind === option.value ? "active" : ""}
                    onClick={() => onSearchKind(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <span className={hasMovieProxy ? "live-status" : "live-status demo"}>
              <span className="live-dot" aria-hidden="true" />
              {hasMovieProxy ? "Live search" : "Demo search"}
            </span>
          </div>
          <div className="dropdown-list">
            {searchLoading && <p className="dropdown-state">Checking the shelves...</p>}
            {searchError && <p className="dropdown-state error">{searchError}</p>}
            {!searchLoading && !searchResults.length && (
              <p className="dropdown-state">Nothing surfaced. Try another spelling, or add it manually below.</p>
            )}
            {searchResults.map((movie) => {
              const alreadyAdded = movies.some((item) => isSameItem(item, movie));
              return (
                <article key={`${movie.kind ?? "movie"}-${movie.source}-${movie.tvdbId ?? movie.title}`} className="candidate">
                  <img src={movie.posterUrl} alt="" />
                  <div>
                    <h3>{movie.title}</h3>
                    <p className={movie.kind === "series" ? "wrap" : undefined}>
                      <span className={movie.kind === "series" ? "kind-pill" : "kind-pill movie"}>
                        {movie.kind === "series" ? "Series" : "Movie"}
                      </span>
                      {titleMeta(movie)}
                    </p>
                    {isUpcomingCandidate(movie) && (
                      <small className="upcoming-tag">Not out yet · {releaseLabel(movie.releaseDate, movie.year)}</small>
                    )}
                    <small>{movie.genres.join(" / ")}</small>
                  </div>
                  <button disabled={alreadyAdded} onClick={() => onAdd(movie)}>
                    {alreadyAdded ? "Added" : "Add"}
                  </button>
                </article>
              );
            })}
          </div>
          <button type="button" className="add-manual-strip" onClick={onManual}>
            + Add manually
          </button>
        </div>
      )}
    </section>
  );
}

// Who rated what, the average, and a note while someone's rating is still missing.
function RatingSummary({ movie, members }: { movie: Movie; members: Member[] }) {
  if (movie.status !== "watched") return null;
  const avg = averageRating(movie);
  const progress = ratingProgress(movie, members);
  const pending = !progress.complete;
  return (
    <>
      <div className="rating-summary">
        {members.map((member) => (
          <span key={member.id}>
            {member.displayName} {movie.ratings[member.id]?.score ?? "-"}
          </span>
        ))}
        <strong className={pending ? "pending" : undefined}>
          Avg {avg ? avg.toFixed(1) : "-"}
          {pending ? "*" : ""}
        </strong>
      </div>
      {pending && <small className="rating-pending">* Waiting for {progress.waitingFor.join(" and ")} to rate</small>}
    </>
  );
}

type MovieCardProps = {
  movie: Movie;
  score: number;
  members: Member[];
  // "Nov 2027" while the film is not out yet.
  releaseText?: string;
  onView: () => void;
  onToggleWatched: () => void;
};

// Every part of the card sits in its own row so that, across a row of cards, the
// titles, years, ratings and buttons line up exactly (see .movie-card in the styles).
function MovieCard({ movie, score, members, releaseText, onView, onToggleWatched }: MovieCardProps) {
  const isSeries = movie.kind === "series";
  const airing = isSeries && movie.seriesStatus === "Continuing";
  // Ratings show on the card only once everyone has rated; until then the
  // View window has them, with who is still to rate.
  const fullyRated = movie.status === "watched" && ratingProgress(movie, members).complete;
  const alt = altTitle(movie.title, movie.englishTitle);
  return (
    // Tapping anywhere on the card opens the same window as View, except on the buttons.
    // (Keyboard users have the View button.)
    <article
      className="movie-card"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, a")) onView();
      }}
    >
      <div className="poster-wrap">
        <img src={movie.posterUrl} alt="" loading="lazy" />
        {releaseText ? (
          <em className="upcoming-badge">Not out yet</em>
        ) : (
          airing && <em className="airing-badge">Airing</em>
        )}
        <em className={isSeries ? "kind-badge" : "kind-badge movie"}>{isSeries ? "Series" : "Movie"}</em>
        <span>{score}%</span>
      </div>
      <h3 className="card-title">{movie.title}</h3>
      {alt && <p className="alt-title card-alt">({alt})</p>}
      <p className="card-meta">{cardMeta(movie)}</p>
      {fullyRated && (
        <div className="card-rating">
          <RatingSummary movie={movie} members={members} />
        </div>
      )}
      <div className="card-actions">
        <div className="card-buttons">
          <button onClick={onView}>View</button>
          <button className={movie.status === "watched" ? "status watched" : "status"} onClick={onToggleWatched}>
            {movie.status === "watched" ? (isSeries ? "Finished" : "Watched") : isSeries ? "Mark finished" : "Mark watched"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ManualMovieModal({ onClose, onAdd }: { onClose: () => void; onAdd: (movie: MovieCandidate) => void }) {
  const [selectedMoods, setSelectedMoods] = useState<Mood[]>(["cozy"]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const movie: MovieCandidate = {
      source: "manual",
      title: String(form.get("title") || "Untitled pick"),
      year: String(form.get("year") || "TBA"),
      runtime: Number(form.get("runtime") || 100),
      genres: String(form.get("genres") || "Drama")
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean)
        .slice(0, 4),
      moods: selectedMoods.length ? selectedMoods : ["low-effort"],
      synopsis: String(form.get("synopsis") || "A private pick added by the room."),
      posterUrl: String(form.get("posterUrl") || "/poster-placeholder.svg"),
      trailerUrl: normalizeTrailerUrl(String(form.get("trailerUrl") || "")),
      language: String(form.get("language") || "") || undefined,
    };
    onAdd(movie);
    onClose();
  };

  return (
    <Modal title="Add a private pick" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Title
          <input name="title" required placeholder="Before Sunrise" />
        </label>
        <div className="form-split">
          <label>
            Year
            <input name="year" placeholder="1995" />
          </label>
          <label>
            Runtime
            <input name="runtime" type="number" min="1" placeholder="101" />
          </label>
        </div>
        <label>
          Genres
          <input name="genres" placeholder="Romance, Drama" />
        </label>
        <label>
          Language
          <select name="language" defaultValue="">
            <option value="">Not sure</option>
            {DISCOVER_LANGUAGES.filter((language) => language.code !== "any").map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Synopsis
          <textarea name="synopsis" rows={4} placeholder="Why this belongs in the maybe pile." />
        </label>
        <label>
          Poster URL
          <input name="posterUrl" placeholder="Leave blank for a cozy placeholder" />
        </label>
        <label>
          YouTube embed URL
          <input name="trailerUrl" placeholder="https://www.youtube.com/embed/..." />
        </label>
        <div className="mood-checks">
          {moods.map((mood) => (
            <label key={mood}>
              <input
                type="checkbox"
                checked={selectedMoods.includes(mood)}
                onChange={(event) =>
                  setSelectedMoods((current) =>
                    event.target.checked ? [...current, mood] : current.filter((item) => item !== mood),
                  )
                }
              />
              {moodLabels[mood]}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Add movie
          </button>
        </div>
      </form>
    </Modal>
  );
}

const RATING_MAX = 10;

function ScorePicker({ value, onChange, label }: { value: number | null; onChange: (score: number) => void; label: string }) {
  return (
    <div className="score-picker" role="radiogroup" aria-label={label}>
      {Array.from({ length: RATING_MAX }, (_, index) => index + 1).map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          className={value === score ? "active" : ""}
          onClick={() => onChange(score)}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

function RatingModal({
  members,
  currentMemberId,
  movie,
  onClose,
  onSave,
}: {
  members: Member[];
  currentMemberId?: MemberId;
  movie: Movie;
  onClose: () => void;
  onSave: (movieId: string, partner: MemberId, score: number, note: string) => void;
}) {
  // You can only rate for yourself; everyone else's rating is read-only.
  const editable = (member: Member) => !currentMemberId || member.id === currentMemberId;
  const editableMembers = members.filter(editable);

  const [drafts, setDrafts] = useState<Record<MemberId, { score: number | null; note: string }>>(() =>
    Object.fromEntries(
      editableMembers.map((member) => [
        member.id,
        { score: movie.ratings[member.id]?.score ?? null, note: movie.ratings[member.id]?.note ?? "" },
      ]),
    ),
  );

  const changed = (member: Member) => {
    const draft = drafts[member.id];
    const existing = movie.ratings[member.id];
    return draft.score !== null && (draft.score !== existing?.score || draft.note.trim() !== (existing?.note ?? ""));
  };
  const canSave = editableMembers.some(changed);

  const updateDraft = (id: MemberId, patch: Partial<{ score: number | null; note: string }>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const save = () => {
    editableMembers.filter(changed).forEach((member) => {
      onSave(movie.id, member.id, drafts[member.id].score as number, drafts[member.id].note);
    });
    onClose();
  };

  return (
    <Modal title={`Rate ${movie.title}`} onClose={onClose}>
      <div className="rating-modal">
        {members.map((member) => {
          const isYou = member.id === currentMemberId;
          if (!editable(member)) {
            const theirs = movie.ratings[member.id];
            return (
              <div key={member.id} className="partner-rating">
                <div>
                  <h3>{member.displayName}</h3>
                  <span>{theirs ? `${theirs.score}/${RATING_MAX}` : "Not rated yet"}</span>
                </div>
                {theirs?.note && <p className="rating-note">“{theirs.note}”</p>}
              </div>
            );
          }

          const draft = drafts[member.id];
          return (
            <div key={member.id} className="partner-rating">
              <div>
                <h3>{isYou ? `${member.displayName} (you)` : member.displayName}</h3>
                <span>{draft.score ? `${draft.score}/${RATING_MAX}` : "Pick a score"}</span>
              </div>
              <ScorePicker
                value={draft.score}
                label={`${member.displayName}'s score out of ${RATING_MAX}`}
                onChange={(score) => updateDraft(member.id, { score })}
              />
              <textarea
                value={draft.note}
                rows={3}
                onChange={(event) => updateDraft(member.id, { note: event.target.value })}
                placeholder="Add a note (everyone in the room can read it)"
              />
            </div>
          );
        })}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={!canSave} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TrailerModal({ movie, onClose }: { movie: { title: string; trailerUrl?: string }; onClose: () => void }) {
  const src = normalizeTrailerUrl(movie.trailerUrl);
  return (
    <Modal title={`${movie.title} trailer`} onClose={onClose} wide centered>
      {src ? (
        <div className="trailer-frame">
          <iframe
            src={src}
            title={`${movie.title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <EmptyState title="No trailer yet" body="This pick is still perfectly allowed on the couch." />
      )}
    </Modal>
  );
}

function AccountModal({
  recovering,
  onClose,
}: {
  recovering: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const switchMode = (next: "signin" | "signup" | "forgot") => {
    setMode(next);
    setError("");
    setNotice("");
  };

  if (recovering) {
    const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const password = String(new FormData(event.currentTarget).get("password") || "");

      setBusy(true);
      setError("");
      const result = await updatePassword(password);
      setBusy(false);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
    };

    return (
      <Modal title="Choose a new password" onClose={onClose}>
        <form className="modal-form" onSubmit={submitNewPassword}>
          <label>
            New password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
          </label>
          {error && <p className="auth-message error">{error}</p>}
          <div className="modal-actions">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "One moment..." : "Save new password"}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const emailValue = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    setBusy(true);
    setError("");
    setNotice("");

    if (mode === "forgot") {
      const result = await requestPasswordReset(emailValue);
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice("If that email has an account, a reset link is on its way. Open it on this device.");
      return;
    }

    const result =
      mode === "signup"
        ? await signUpWithEmail(emailValue, password, String(form.get("displayName") || ""))
        : await signInWithEmail(emailValue, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.needsEmailConfirmation) {
      setNotice("Check your email for a confirmation link, then come back and sign in.");
      return;
    }
    onClose();
  };

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in";

  return (
    <Modal title={title} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Your name
            <input name="displayName" required maxLength={40} autoComplete="given-name" placeholder="What should your partner see?" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        {mode !== "forgot" && (
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="At least 6 characters"
            />
          </label>
        )}
        {error && <p className="auth-message error">{error}</p>}
        {notice && <p className="auth-message">{notice}</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Create account" : "Back to sign in"}
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "One moment..." : mode === "signup" ? "Sign up" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
        </div>
        {mode === "signin" && (
          <button type="button" className="link-button" onClick={() => switchMode("forgot")}>
            Forgot your password?
          </button>
        )}
      </form>
    </Modal>
  );
}

export default App;
