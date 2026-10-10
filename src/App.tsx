import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { demoCandidates, moods } from "./demoData";
import { createId, createRoom, loadState, resetState, saveState } from "./storage";
import { getCachedMovieSuggestions, hasMovieProxy, searchMovies } from "./movieSearch";
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
import type { AppState, Member, MemberId, Mood, Movie, MovieCandidate, RouletteFilters, TasteProfile } from "./types";

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

const movieFromCandidate = (candidate: MovieCandidate, addedBy: MemberId): Movie => {
  const movie = { ...candidate };
  delete movie.searchTerms;
  return {
    ...movie,
    id: createId(),
    addedBy,
    addedAt: todayIso(),
    status: "unwatched",
    ratings: {},
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const calculateTasteProfile = (movies: Movie[]): TasteProfile => {
  const watched = movies.filter((movie) => movie.status === "watched");
  if (!watched.length) {
    return { favoriteGenres: [], topMoods: [], preferredRuntime: 110, watchedCount: 0 };
  }

  const genreScores = new Map<string, number>();
  const moodScores = new Map<Mood, number>();
  let weightedRuntime = 0;
  let totalWeight = 0;

  watched.forEach((movie) => {
    const weight = averageRating(movie) ?? 3;
    totalWeight += weight;
    weightedRuntime += movie.runtime * weight;
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
    preferredRuntime: Math.round(weightedRuntime / Math.max(totalWeight, 1)),
    watchedCount: watched.length,
  };
};

const matchScore = (movie: Movie, profile: TasteProfile) => {
  if (movie.status === "watched") {
    return Math.round((averageRating(movie) ?? 3.5) * 18);
  }

  if (!profile.watchedCount) {
    return clamp(70 + (movie.moods.includes("low-effort") ? 8 : 0) - Math.max(0, movie.runtime - 130) / 8, 52, 91);
  }

  const genreHits = movie.genres.filter((genre) => profile.favoriteGenres.includes(genre)).length;
  const moodHits = movie.moods.filter((mood) => profile.topMoods.includes(mood)).length;
  const runtimeFit = Math.max(0, 16 - Math.abs(movie.runtime - profile.preferredRuntime) / 4);
  const freshness = movie.addedAt ? Math.max(0, 5 - (Date.now() - new Date(movie.addedAt).getTime()) / 86400000 / 6) : 0;

  return Math.round(clamp(58 + genreHits * 8 + moodHits * 6 + runtimeFit + freshness, 45, 98));
};

const filterMovies = (movies: Movie[], filters: RouletteFilters) =>
  movies.filter((movie) => {
    if (filters.onlyUnwatched && movie.status !== "unwatched") return false;
    if (movie.runtime > filters.maxRuntime) return false;
    if (filters.genre !== "any" && !movie.genres.includes(filters.genre)) return false;
    if (filters.mood !== "any" && !movie.moods.includes(filters.mood)) return false;
    return true;
  });

type WatchStatusFilter = "any" | "watched" | "unwatched";
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
    case "runtime-asc":
      return sorted.sort((a, b) => a.runtime - b.runtime);
    case "runtime-desc":
      return sorted.sort((a, b) => b.runtime - a.runtime);
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

type View = "tonight" | "watchlist" | "history";
const views: View[] = ["tonight", "watchlist", "history"];
const viewLabels: Record<View, string> = { tonight: "Tonight", watchlist: "Watchlist", history: "History" };

const viewFromHash = (): View => {
  const hash = window.location.hash.replace("#", "");
  return (views as string[]).includes(hash) ? (hash as View) : "tonight";
};

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<View>(() => viewFromHash());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, passwordRecovery, clearPasswordRecovery } = useAuth();
  const cloud = useCloudRoom(user?.id);
  const cloudActive = Boolean(user && cloud.room);
  const cloudMovies = useCloudMovies(user && cloud.room ? cloud.room.id : null);
  const [actionError, setActionError] = useState("");
  const showSetup = Boolean(user) && !cloud.room;
  // Signed in with a room: the shared cloud watchlist. Otherwise: the local demo.
  const movies = cloudActive ? cloudMovies.movies : state.movies;
  const members = useMemo<Member[]>(
    () =>
      cloudActive
        ? cloud.members.map((member) => ({ id: member.userId, displayName: member.displayName }))
        : [
            { id: "partnerA", displayName: state.room.partnerA },
            { id: "partnerB", displayName: state.room.partnerB },
          ],
    [cloudActive, cloud.members, state.room.partnerA, state.room.partnerB],
  );

  useEffect(() => {
    if (passwordRecovery) setAccountOpen(true);
  }, [passwordRecovery]);
  const [trailerMovie, setTrailerMovie] = useState<Movie | null>(null);
  const [ratingMovie, setRatingMovie] = useState<Movie | null>(null);
  const [filters, setFilters] = useState<RouletteFilters>({
    maxRuntime: 150,
    genre: "any",
    mood: "any",
    onlyUnwatched: true,
  });
  const [rouletteIndex, setRouletteIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const rouletteTileRefs = useRef(new Map<string, HTMLDivElement>());
  const [watchlistGenre, setWatchlistGenre] = useState("any");
  const [watchlistYear, setWatchlistYear] = useState("any");
  const [watchlistStatus, setWatchlistStatus] = useState<WatchStatusFilter>("any");
  const [watchlistMaxRuntime, setWatchlistMaxRuntime] = useState(DEFAULT_WATCHLIST_MAX_RUNTIME);
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>("added-desc");

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (window.location.hash.replace("#", "") !== view) {
      window.location.hash = view;
    }
  }, [view]);

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
      ? getCachedMovieSuggestions(trimmed)
      : demoCandidates.filter((movie) => movie.title.toLowerCase().includes(trimmed.toLowerCase()));
    setSearchResults(instantSuggestions);
    setSearchError("");

    let active = true;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        if (hasMovieProxy) {
          const proxyResults = await searchMovies(trimmed);
          if (active) {
            const mergedResults = [...proxyResults, ...getCachedMovieSuggestions(trimmed)].filter(
              (movie, index, all) =>
                all.findIndex((item) => item.tvdbId === movie.tvdbId && item.title === movie.title) === index,
            );
            setSearchResults(mergedResults.slice(0, 6));
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
  }, [query, movies]);

  const genres = useMemo(
    () => [...new Set(movies.flatMap((movie) => movie.genres))].sort((a, b) => a.localeCompare(b)),
    [movies],
  );
  const years = useMemo(
    () =>
      [...new Set(movies.map((movie) => movie.year).filter((year) => /^\d{4}$/.test(year)))].sort(
        (a, b) => Number(b) - Number(a),
      ),
    [movies],
  );
  const profile = useMemo(() => calculateTasteProfile(movies), [movies]);
  const watchlistFiltersActive =
    watchlistGenre !== "any" ||
    watchlistYear !== "any" ||
    watchlistStatus !== "any" ||
    watchlistMaxRuntime !== DEFAULT_WATCHLIST_MAX_RUNTIME;
  const filteredWatchlist = useMemo(() => {
    const filtered = movies.filter((movie) => {
      if (watchlistGenre !== "any" && !movie.genres.includes(watchlistGenre)) return false;
      if (watchlistYear !== "any" && movie.year !== watchlistYear) return false;
      if (watchlistStatus !== "any" && movie.status !== watchlistStatus) return false;
      if (movie.runtime > watchlistMaxRuntime) return false;
      return true;
    });
    return sortWatchlist(filtered, watchlistSort, profile);
  }, [movies, watchlistGenre, watchlistYear, watchlistStatus, watchlistMaxRuntime, watchlistSort, profile]);
  const resetWatchlistFilters = () => {
    setWatchlistGenre("any");
    setWatchlistYear("any");
    setWatchlistStatus("any");
    setWatchlistMaxRuntime(DEFAULT_WATCHLIST_MAX_RUNTIME);
  };
  const moviesByMatch = useMemo(
    () =>
      movies
        .filter((movie) => movie.status === "unwatched")
        .sort((a, b) => matchScore(b, profile) - matchScore(a, profile)),
    [movies, profile],
  );
  const bestTonight = moviesByMatch[0];
  const rouletteMovies = useMemo(
    () => filterMovies(movies, filters).sort((a, b) => matchScore(b, profile) - matchScore(a, profile)),
    [movies, filters, profile],
  );
  const selectedMovie = selectedMovieId ? movies.find((movie) => movie.id === selectedMovieId) : undefined;
  const activeRouletteIndex = useMemo(() => {
    if (spinning || !selectedMovieId) return rouletteIndex;
    const selectedIndex = rouletteMovies.findIndex((movie) => movie.id === selectedMovieId);
    return selectedIndex >= 0 ? selectedIndex : rouletteIndex;
  }, [rouletteIndex, rouletteMovies, selectedMovieId, spinning]);
  const watchedMovies = useMemo(
    () =>
      movies
        .filter((movie) => movie.status === "watched")
        .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime()),
    [movies],
  );
  const unwatchedCount = movies.length - watchedMovies.length;

  useEffect(() => {
    setRouletteIndex((current) => (rouletteMovies.length ? current % rouletteMovies.length : 0));
    setSelectedMovieId((current) => (current && rouletteMovies.some((movie) => movie.id === current) ? current : null));
  }, [rouletteMovies]);

  useEffect(() => {
    const activeMovie = rouletteMovies[activeRouletteIndex];
    const activeTile = activeMovie ? rouletteTileRefs.current.get(activeMovie.id) : undefined;
    activeTile?.scrollIntoView({ block: "nearest", inline: "center", behavior: spinning ? "auto" : "smooth" });
  }, [activeRouletteIndex, rouletteMovies, spinning]);

  const reportFailure = (result: { ok: true } | { ok: false; message: string }) => {
    if (!result.ok) setActionError(result.message);
  };

  const updateMovie = (movieId: string, updater: (movie: Movie) => Movie) => {
    if (cloudActive) {
      const current = movies.find((movie) => movie.id === movieId);
      if (!current) return;
      const next = updater(current);
      if (next.status !== current.status || next.watchedAt !== current.watchedAt) {
        setActionError("");
        cloudMovies.setStatus(movieId, next.status, next.watchedAt).then(reportFailure);
      }
      return;
    }

    setState((current) => ({
      ...current,
      movies: current.movies.map((movie) => (movie.id === movieId ? updater(movie) : movie)),
    }));
  };

  const addMovie = (candidate: MovieCandidate) => {
    const exists = movies.some((movie) => movie.title.toLowerCase() === candidate.title.toLowerCase());
    if (exists) {
      setSearchError("That one is already on your couch list.");
      return;
    }

    if (cloudActive && user) {
      setActionError("");
      cloudMovies.add(candidate, user.id).then((result) => {
        reportFailure(result);
        if (result.ok) {
          setQuery("");
          setSearchResults([]);
        }
      });
      return;
    }

    setState((current) => ({ ...current, movies: [movieFromCandidate(candidate, "partnerA"), ...current.movies] }));
    setQuery("");
    setSearchResults([]);
  };

  const removeMovie = (movieId: string) => {
    const movie = movies.find((item) => item.id === movieId);
    if (!movie) return;
    if (!window.confirm(`Remove "${movie.title}" from the watchlist? This also deletes its ratings and history.`)) {
      return;
    }
    if (cloudActive) {
      setActionError("");
      cloudMovies.remove(movieId).then(reportFailure);
      return;
    }
    setState((current) => ({ ...current, movies: current.movies.filter((item) => item.id !== movieId) }));
  };

  const spinRoulette = () => {
    if (!rouletteMovies.length || spinning) return;

    const weighted = rouletteMovies.flatMap((movie, index) => Array(Math.max(1, rouletteMovies.length - index)).fill(movie));
    const winner = weighted[Math.floor(Math.random() * weighted.length)] as Movie;
    const winnerIndex = rouletteMovies.findIndex((movie) => movie.id === winner.id);
    const loops = 6 + Math.floor(Math.random() * 3);
    const totalSteps = loops * rouletteMovies.length + winnerIndex;

    setSpinning(true);
    setSelectedMovieId(null);

    const tick = (step: number) => {
      setRouletteIndex(step % rouletteMovies.length);
      if (step >= totalSteps) {
        setRouletteIndex(winnerIndex);
        setSelectedMovieId(winner.id);
        setSpinning(false);
        return;
      }
      window.setTimeout(() => tick(step + 1), 72 + step * 8);
    };

    tick(0);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Movie Night Roulette</p>
          <h1>{user ? (cloud.room?.name ?? "Set up your room") : state.room.name}</h1>
        </div>
        <div className="topbar-actions">
          {hasSupabase && (
            <button className="ghost-button" onClick={() => setAccountOpen(true)}>
              {user ? "Account" : "Sign in"}
            </button>
          )}
          <button className="ghost-button" onClick={() => setRoomOpen(true)}>
            Room
          </button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Sections">
        {views.map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
            {viewLabels[item]}
          </button>
        ))}
      </nav>

      <main className="view" aria-label={`${viewLabels[view]} view`}>
        {actionError && (
          <p className="auth-message error" role="alert">
            {actionError}
          </p>
        )}
        {showSetup && (
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
        {!showSetup && view === "tonight" && (
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
            />

            <div className="tonight-grid">
              <div className="tonight-main">
                <p className="room-status">
                  {unwatchedCount} maybes · {watchedMovies.length} watched
                </p>

                {bestTonight ? (
                  <article className="best-card">
                    <img src={bestTonight.posterUrl} alt="" />
                    <div>
                      <span className="score">{matchScore(bestTonight, profile)}% match</span>
                      <h2>Best for us tonight</h2>
                      <h3>{bestTonight.title}</h3>
                      <p>
                        {bestTonight.runtime} min • {bestTonight.genres.slice(0, 2).join(" / ")}
                      </p>
                      <button className="primary-button" onClick={spinRoulette}>
                        Spin with this vibe
                      </button>
                    </div>
                  </article>
                ) : (
                  <EmptyState
                    title={cloudActive ? "Your watchlist is empty" : "The list is waiting"}
                    body={
                      cloudActive
                        ? "Search above to add your first movie. Your partner will see it too."
                        : "Add a few movies and the app will start learning what works for both of you."
                    }
                  />
                )}
              </div>

              <section className="panel roulette-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Roulette</p>
                    <h2>Let the room choose</h2>
                  </div>
                  <span>{rouletteMovies.length} eligible</span>
                </div>

                <div className="filters">
                  <label>
                    Max runtime
                    <input
                      type="range"
                      min="80"
                      max="190"
                      step="5"
                      value={filters.maxRuntime}
                      disabled={spinning}
                      onChange={(event) => setFilters({ ...filters, maxRuntime: Number(event.target.value) })}
                    />
                    <strong>{filters.maxRuntime} min</strong>
                  </label>
                  <label>
                    Genre
                    <select disabled={spinning} value={filters.genre} onChange={(event) => setFilters({ ...filters, genre: event.target.value })}>
                      <option value="any">Any genre</option>
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mood
                    <select
                      disabled={spinning}
                      value={filters.mood}
                      onChange={(event) => setFilters({ ...filters, mood: event.target.value as Mood | "any" })}
                    >
                      <option value="any">Any mood</option>
                      {moods.map((mood) => (
                        <option key={mood} value={mood}>
                          {moodLabels[mood]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={filters.onlyUnwatched}
                      disabled={spinning}
                      onChange={(event) => setFilters({ ...filters, onlyUnwatched: event.target.checked })}
                    />
                    Only unwatched
                  </label>
                </div>

                <div className="roulette-stage" aria-live="polite">
                  {rouletteMovies.length ? (
                    <>
                      <div className={spinning ? "roulette-strip spinning" : "roulette-strip"}>
                        {rouletteMovies.map((movie, index) => (
                          <div
                            key={movie.id}
                            ref={(node) => {
                              if (node) {
                                rouletteTileRefs.current.set(movie.id, node);
                              } else {
                                rouletteTileRefs.current.delete(movie.id);
                              }
                            }}
                            className={index === activeRouletteIndex ? "roulette-tile active" : "roulette-tile"}
                          >
                            <img src={movie.posterUrl} alt="" />
                            <span>{movie.title}</span>
                          </div>
                        ))}
                      </div>
                      <button className="spin-button" disabled={spinning} onClick={spinRoulette}>
                        {spinning ? "Choosing..." : "Spin roulette"}
                      </button>
                    </>
                  ) : (
                    <EmptyState title="No movies match" body="Loosen a filter and the roulette wheel will behave itself again." />
                  )}
                </div>

                {selectedMovie && (
                  <div className="winner">
                    <span className="pill">Tonight's pick</span>
                    <div>
                      <h3>{selectedMovie.title}</h3>
                      <p>{selectedMovie.synopsis}</p>
                    </div>
                    <div className="winner-actions">
                      {selectedMovie.trailerUrl && <button onClick={() => setTrailerMovie(selectedMovie)}>Trailer</button>}
                      <button
                        onClick={() =>
                          updateMovie(selectedMovie.id, (movie) => ({
                            ...movie,
                            status: "watched",
                            watchedAt: movie.watchedAt ?? todayIso(),
                          }))
                        }
                      >
                        Mark watched
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {!showSetup && view === "watchlist" && (
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
                  <span>
                    <strong>Top moods</strong> {profile.topMoods.map((mood) => moodLabels[mood]).join(", ")}
                  </span>
                </>
              ) : (
                <span>Rate a watched movie together and this will start learning your taste.</span>
              )}
            </section>

            <section className="panel filters-panel">
              <div className="section-heading">
                <p className="eyebrow">Filter &amp; sort</p>
                {watchlistFiltersActive && (
                  <button type="button" className="link-button" onClick={resetWatchlistFilters}>
                    Reset filters
                  </button>
                )}
              </div>
              <div className="filters">
                <label>
                  Genre
                  <select value={watchlistGenre} onChange={(event) => setWatchlistGenre(event.target.value)}>
                    <option value="any">Any genre</option>
                    {genres.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Year
                  <select value={watchlistYear} onChange={(event) => setWatchlistYear(event.target.value)}>
                    <option value="any">Any year</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={watchlistStatus}
                    onChange={(event) => setWatchlistStatus(event.target.value as WatchStatusFilter)}
                  >
                    <option value="any">Any status</option>
                    <option value="unwatched">Unwatched</option>
                    <option value="watched">Watched</option>
                  </select>
                </label>
                <label>
                  Max runtime
                  <input
                    type="range"
                    min="10"
                    max={DEFAULT_WATCHLIST_MAX_RUNTIME}
                    step="5"
                    value={watchlistMaxRuntime}
                    onChange={(event) => setWatchlistMaxRuntime(Number(event.target.value))}
                  />
                  <strong>
                    {watchlistMaxRuntime >= DEFAULT_WATCHLIST_MAX_RUNTIME ? "Any" : `${watchlistMaxRuntime} min`}
                  </strong>
                </label>
                <label>
                  Sort by
                  <select value={watchlistSort} onChange={(event) => setWatchlistSort(event.target.value as WatchlistSort)}>
                    {watchlistSortOptions.map((option) => (
                      <option key={option} value={option}>
                        {sortLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="watchlist">
              <div className="section-heading">
                <h2>Watchlist</h2>
                <span>
                  {watchlistFiltersActive
                    ? `${filteredWatchlist.length} of ${movies.length} movies`
                    : `${movies.length} movies`}
                </span>
              </div>
              {movies.length ? (
                filteredWatchlist.length ? (
                  <div className="movie-grid">
                    {filteredWatchlist.map((movie) => (
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                        score={matchScore(movie, profile)}
                        members={members}
                        onTrailer={() => setTrailerMovie(movie)}
                        onRate={() => setRatingMovie(movie)}
                        onRemove={() => removeMovie(movie.id)}
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
                      ? "Search above to add your first movie. Your partner will see it too."
                      : "Start with one comfort pick and one wild card. That is usually enough to get moving."
                  }
                />
              )}
            </section>
          </>
        )}

        {!showSetup && view === "history" && (
          <section className="panel history-panel">
            <div className="section-heading">
              <h2>History</h2>
              <span>{watchedMovies.length} nights</span>
            </div>
            {watchedMovies.length ? (
              <div className="history-list">
                {watchedMovies.map((movie) => (
                  <article key={movie.id}>
                    <img src={movie.posterUrl} alt="" />
                    <div>
                      <h3>{movie.title}</h3>
                      <p>
                        {formatDate(movie.watchedAt)} • Added by {memberNameOf(members, movie.addedBy)}
                      </p>
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
      </main>
      <footer className="credits">
        Movie data from{" "}
        <a href="https://thetvdb.com" target="_blank" rel="noreferrer">
          TheTVDB.com
        </a>
        . This product is not endorsed or certified by TheTVDB.
      </footer>

      {manualOpen && <ManualMovieModal onClose={() => setManualOpen(false)} onAdd={addMovie} />}
      {accountOpen && (
        <AccountModal
          email={user?.email ?? null}
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
      {roomOpen && !user && (
        <RoomModal
          state={state}
          onClose={() => setRoomOpen(false)}
          onSave={(room, keepMovies) => {
            setState((current) => ({ room, movies: keepMovies ? current.movies : [] }));
            setRoomOpen(false);
          }}
          onReset={() => {
            setState(resetState());
            setRoomOpen(false);
          }}
        />
      )}
      {trailerMovie && <TrailerModal movie={trailerMovie} onClose={() => setTrailerMovie(null)} />}
      {ratingMovie && (
        <RatingModal
          members={members}
          currentMemberId={cloudActive ? user?.id : undefined}
          movie={movies.find((movie) => movie.id === ratingMovie.id) ?? ratingMovie}
          onClose={() => setRatingMovie(null)}
          onSave={(movieId, partner, score, note) => {
            if (cloudActive && user) {
              const existing = movies.find((movie) => movie.id === movieId);
              setActionError("");
              cloudMovies.saveRating(movieId, user.id, score, note).then(async (result) => {
                reportFailure(result);
                if (result.ok && existing && existing.status !== "watched") {
                  reportFailure(await cloudMovies.setStatus(movieId, "watched", existing.watchedAt ?? todayIso()));
                }
              });
              return;
            }
            updateMovie(movieId, (movie) => ({
              ...movie,
              status: "watched",
              watchedAt: movie.watchedAt ?? todayIso(),
              ratings: {
                ...movie.ratings,
                [partner]: { score, note, ratedAt: todayIso() },
              },
            }));
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
};

function AddMovieBar({
  movies,
  query,
  setQuery,
  searchLoading,
  searchError,
  searchResults,
  onManual,
  onAdd,
}: AddMovieBarProps) {
  return (
    <section className="search-shell" aria-label="Add a movie">
      <div className="search-field">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.6" />
          <line x1="13.6" y1="13.6" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a movie to add" />
        {query && (
          <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>
      <div className="search-meta">
        <button type="button" className="link-button" onClick={onManual}>
          + Add manually
        </button>
        <span className="proxy-status">{hasMovieProxy ? "Live search" : "Demo search"}</span>
      </div>

      {query && (
        <div className="search-dropdown">
          {searchLoading && <p className="dropdown-state">Checking the shelves...</p>}
          {searchError && <p className="dropdown-state error">{searchError}</p>}
          {!searchLoading && !searchResults.length && (
            <p className="dropdown-state">
              Nothing surfaced.{" "}
              <button type="button" className="link-button" onClick={onManual}>
                Add it manually
              </button>
              .
            </p>
          )}
          {searchResults.map((movie) => {
            const alreadyAdded = movies.some((item) => item.title.toLowerCase() === movie.title.toLowerCase());
            return (
              <article key={`${movie.source}-${movie.tvdbId ?? movie.title}`} className="candidate">
                <img src={movie.posterUrl} alt="" />
                <div>
                  <h3>{movie.title}</h3>
                  <p>
                    {movie.year} • {movie.runtime} min
                  </p>
                  <small>{movie.genres.join(" / ")}</small>
                </div>
                <button disabled={alreadyAdded} onClick={() => onAdd(movie)}>
                  {alreadyAdded ? "Added" : "Add"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type MovieCardProps = {
  movie: Movie;
  score: number;
  members: Member[];
  onTrailer: () => void;
  onRate: () => void;
  onRemove: () => void;
  onToggleWatched: () => void;
};

function MovieCard({ movie, score, members, onTrailer, onRate, onRemove, onToggleWatched }: MovieCardProps) {
  const avg = averageRating(movie);
  const progress = ratingProgress(movie, members);
  const pending = movie.status === "watched" && !progress.complete;
  return (
    <article className="movie-card">
      <div className="poster-wrap">
        <img src={movie.posterUrl} alt="" loading="lazy" />
        <span>
          {score}%{pending ? "*" : ""}
        </span>
      </div>
      <div className="movie-content">
        <div className="movie-title-row">
          <div>
            <h3>{movie.title}</h3>
            <p>
              {movie.year} • {movie.runtime} min
            </p>
          </div>
          <button className={movie.status === "watched" ? "status watched" : "status"} onClick={onToggleWatched}>
            {movie.status === "watched" ? "Watched" : "Unwatched"}
          </button>
        </div>
        <div className="chip-row">
          {movie.genres.map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
        <p className="synopsis">{movie.synopsis}</p>
        <div className="meta-row">
          <span>Added by {memberNameOf(members, movie.addedBy)}</span>
          <span>{movie.moods.map((mood) => moodLabels[mood]).join(", ")}</span>
        </div>
        {movie.status === "watched" && (
          <div className="rating-summary">
            {members.map((member) => (
              <span key={member.id}>
                {member.displayName}: {movie.ratings[member.id]?.score ?? "-"}
              </span>
            ))}
            <strong className={pending ? "pending" : undefined}>
              Avg {avg ? avg.toFixed(1) : "-"}
              {pending ? "*" : ""}
            </strong>
          </div>
        )}
        {pending && <small className="rating-pending">* Waiting for {progress.waitingFor.join(" and ")} to rate</small>}
        <div className="card-actions">
          <button disabled={!movie.trailerUrl} onClick={onTrailer}>
            Trailer
          </button>
          <button onClick={onRate}>Rate</button>
          <button className="remove-button" onClick={onRemove}>
            Remove
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
      trailerUrl: String(form.get("trailerUrl") || "") || undefined,
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

function RoomModal({
  state,
  onClose,
  onSave,
  onReset,
}: {
  state: AppState;
  onClose: () => void;
  onSave: (room: AppState["room"], keepMovies: boolean) => void;
  onReset: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const keepMovies = form.get("keepMovies") === "on";
    if (!keepMovies && state.movies.length && !window.confirm("This clears your whole watchlist and history. Continue?")) {
      return;
    }
    onSave(
      createRoom(
        String(form.get("roomName") || state.room.name),
        String(form.get("partnerA") || state.room.partnerA),
        String(form.get("partnerB") || state.room.partnerB),
      ),
      keepMovies,
    );
  };

  const handleReset = () => {
    if (window.confirm("This restores the demo room and erases your current watchlist and history. Continue?")) {
      onReset();
    }
  };

  return (
    <Modal title="Couple room" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Room name
          <input name="roomName" defaultValue={state.room.name} />
        </label>
        <div className="form-split">
          <label>
            Partner one
            <input name="partnerA" defaultValue={state.room.partnerA} />
          </label>
          <label>
            Partner two
            <input name="partnerB" defaultValue={state.room.partnerB} />
          </label>
        </div>
        <label className="toggle-row">
          <input name="keepMovies" type="checkbox" defaultChecked />
          Keep current watchlist
        </label>
        <p className="room-code">Local room code: {state.room.id.slice(0, 8).toUpperCase()}</p>
        <div className="modal-actions">
          <button type="button" onClick={handleReset}>
            Restore demo
          </button>
          <button className="primary-button" type="submit">
            Save room
          </button>
        </div>
      </form>
    </Modal>
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
  return (
    <Modal title={`Rate ${movie.title}`} onClose={onClose}>
      <div className="rating-modal">
        {members.map((member) => (
          <PartnerRatingForm
            key={member.id}
            partner={member.id}
            name={member.displayName}
            isYou={member.id === currentMemberId}
            editable={!currentMemberId || member.id === currentMemberId}
            movie={movie}
            onSave={onSave}
          />
        ))}
        <div className="modal-actions">
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PartnerRatingForm({
  partner,
  name,
  isYou,
  editable,
  movie,
  onSave,
}: {
  partner: MemberId;
  name: string;
  isYou: boolean;
  editable: boolean;
  movie: Movie;
  onSave: (movieId: string, partner: MemberId, score: number, note: string) => void;
}) {
  const existing = movie.ratings[partner];
  const [score, setScore] = useState(existing?.score ?? 4);
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);

  if (!editable) {
    return (
      <div className="partner-rating">
        <div>
          <h3>{name}</h3>
          <span>{existing ? `${existing.score}/5` : "Not rated yet"}</span>
        </div>
        {existing?.note && <p className="rating-note">“{existing.note}”</p>}
      </div>
    );
  }

  return (
    <div className="partner-rating">
      <div>
        <h3>{isYou ? `${name} (you)` : name}</h3>
        <span>{score}/5</span>
      </div>
      <input type="range" min="1" max="5" step="1" value={score} onChange={(event) => setScore(Number(event.target.value))} />
      <textarea
        value={note}
        rows={3}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a note (everyone in the room can read it)"
      />
      <button
        onClick={() => {
          onSave(movie.id, partner, score, note);
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1600);
        }}
      >
        {saved ? "Saved ✓" : isYou ? "Save my rating" : `Save ${name}'s rating`}
      </button>
    </div>
  );
}

function TrailerModal({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  return (
    <Modal title={`${movie.title} trailer`} onClose={onClose} wide>
      {movie.trailerUrl ? (
        <div className="trailer-frame">
          <iframe
            src={movie.trailerUrl}
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
  email,
  recovering,
  onClose,
}: {
  email: string | null;
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

  if (email) {
    return (
      <Modal title="Your account" onClose={onClose}>
        <div className="modal-form">
          <p className="account-email">
            Signed in as <strong>{email}</strong>
          </p>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={async () => {
                await signOut();
                onClose();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default App;
