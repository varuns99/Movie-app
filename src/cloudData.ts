import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { normalizeTrailerUrl } from "./trailers";
import type { CloudMember, CloudRoom, Mood, Movie, MovieCandidate, Rating, WatchStatus } from "./types";

export const DEFAULT_ROOM_NAME = "Unnamed Movie Room";

export type ActionResult = { ok: true } | { ok: false; message: string };

type RoomRow = { id: string; name: string; invite_code: string };
type MemberRow = { room_id: string; user_id: string; display_name: string; rooms: RoomRow | RoomRow[] | null };

export type CloudRoomData = { room: CloudRoom; members: CloudMember[] };

const messageFrom = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";

const NOT_SET_UP: ActionResult = { ok: false, message: "Accounts are not set up for this site yet." };

// Row Level Security only returns members of rooms the signed-in user belongs
// to, so this query naturally yields just "my room" and its members.
const fetchMyRoom = async (userId: string): Promise<CloudRoomData | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("room_members")
    .select("room_id, user_id, display_name, joined_at, rooms(id, name, invite_code)")
    .order("joined_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as MemberRow[];
  const mine = rows.find((row) => row.user_id === userId);
  if (!mine) return null;

  const roomRow = Array.isArray(mine.rooms) ? mine.rooms[0] : mine.rooms;
  if (!roomRow) return null;

  return {
    room: { id: roomRow.id, name: roomRow.name, inviteCode: roomRow.invite_code },
    members: rows
      .filter((row) => row.room_id === mine.room_id)
      .map((row) => ({ userId: row.user_id, displayName: row.display_name })),
  };
};

export const useCloudRoom = (userId: string | undefined) => {
  const [data, setData] = useState<CloudRoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) {
      setData(null);
      setError("");
      return;
    }

    setLoading(true);
    try {
      setData(await fetchMyRoom(userId));
      setError("");
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { room: data?.room ?? null, members: data?.members ?? [], loading, error, refresh };
};

export const createRoom = async (roomName: string, memberName: string): Promise<ActionResult> => {
  if (!supabase) return NOT_SET_UP;
  try {
    const { error } = await supabase.rpc("create_room", {
      room_name: roomName.trim() || DEFAULT_ROOM_NAME,
      member_name: memberName.trim(),
    });
    return error ? { ok: false, message: error.message } : { ok: true };
  } catch (caught) {
    return { ok: false, message: messageFrom(caught) };
  }
};

export const joinRoom = async (code: string, memberName: string): Promise<ActionResult> => {
  if (!supabase) return NOT_SET_UP;
  try {
    const { error } = await supabase.rpc("join_room", { code: code.trim(), member_name: memberName.trim() });
    return error ? { ok: false, message: error.message } : { ok: true };
  } catch (caught) {
    return { ok: false, message: messageFrom(caught) };
  }
};

export const renameRoom = async (roomId: string, name: string): Promise<ActionResult> => {
  if (!supabase) return NOT_SET_UP;
  try {
    const { error } = await supabase
      .from("rooms")
      .update({ name: name.trim() || DEFAULT_ROOM_NAME })
      .eq("id", roomId);
    return error ? { ok: false, message: error.message } : { ok: true };
  } catch (caught) {
    return { ok: false, message: messageFrom(caught) };
  }
};

export const renameMember = async (roomId: string, userId: string, displayName: string): Promise<ActionResult> => {
  if (!supabase) return NOT_SET_UP;
  try {
    const { error } = await supabase
      .from("room_members")
      .update({ display_name: displayName.trim() })
      .eq("room_id", roomId)
      .eq("user_id", userId);
    return error ? { ok: false, message: error.message } : { ok: true };
  } catch (caught) {
    return { ok: false, message: messageFrom(caught) };
  }
};

// ---------------------------------------------------------------------------
// Movies (the shared watchlist)
// ---------------------------------------------------------------------------

type MovieRow = {
  id: string;
  source: Movie["source"];
  tvdb_id: number | null;
  title: string;
  year: string;
  runtime: number;
  genres: string[];
  moods: string[];
  synopsis: string;
  poster_url: string;
  trailer_url: string | null;
  language: string | null;
  english_title: string | null;
  imdb_id: string | null;
  added_by: string;
  added_at: string;
  status: WatchStatus;
  watched_at: string | null;
  ratings?: { user_id: string; score: number; note: string; rated_at: string }[];
};

const toMovie = (row: MovieRow): Movie => ({
  id: row.id,
  source: row.source,
  tvdbId: row.tvdb_id ?? undefined,
  title: row.title,
  year: row.year,
  runtime: row.runtime,
  genres: row.genres,
  moods: row.moods as Mood[],
  synopsis: row.synopsis,
  posterUrl: row.poster_url,
  trailerUrl: normalizeTrailerUrl(row.trailer_url),
  language: row.language ?? undefined,
  englishTitle: row.english_title ?? undefined,
  imdbId: row.imdb_id ?? undefined,
  addedBy: row.added_by,
  addedAt: row.added_at,
  status: row.status,
  watchedAt: row.watched_at ?? undefined,
  ratings: Object.fromEntries(
    (row.ratings ?? []).map((rating): [string, Rating] => [
      rating.user_id,
      { score: rating.score, note: rating.note, ratedAt: rating.rated_at },
    ]),
  ),
});

export const useCloudMovies = (roomId: string | null) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const currentRoom = useRef<string | null>(roomId);

  const refresh = useCallback(async () => {
    currentRoom.current = roomId;
    if (!supabase || !roomId) {
      setMovies([]);
      setError("");
      return;
    }

    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("movies")
        .select("*, ratings(user_id, score, note, rated_at)")
        .eq("room_id", roomId)
        .order("added_at", { ascending: false });
      if (queryError) throw queryError;
      // Ignore a slow answer if the person switched rooms or signed out meanwhile.
      if (currentRoom.current !== roomId) return;
      setMovies(((data ?? []) as MovieRow[]).map(toMovie));
      setError("");
    } catch (caught) {
      if (currentRoom.current === roomId) setError(messageFrom(caught));
    } finally {
      if (currentRoom.current === roomId) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setMovies([]);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const add = useCallback(
    async (candidate: MovieCandidate, userId: string): Promise<ActionResult> => {
      if (!supabase || !roomId) return NOT_SET_UP;
      try {
        const { data, error: insertError } = await supabase
          .from("movies")
          .insert({
            room_id: roomId,
            source: candidate.source,
            tvdb_id: candidate.tvdbId ?? null,
            title: candidate.title,
            year: candidate.year,
            runtime: candidate.runtime,
            genres: candidate.genres,
            moods: candidate.moods,
            synopsis: candidate.synopsis,
            poster_url: candidate.posterUrl,
            trailer_url: candidate.trailerUrl ?? null,
            language: candidate.language ?? null,
            english_title: candidate.englishTitle ?? null,
            imdb_id: candidate.imdbId ?? null,
            added_by: userId,
          })
          .select("*")
          .single();
        if (insertError) return { ok: false, message: insertError.message };
        setMovies((current) => [toMovie(data as MovieRow), ...current]);
        return { ok: true };
      } catch (caught) {
        return { ok: false, message: messageFrom(caught) };
      }
    },
    [roomId],
  );

  const remove = useCallback(async (movieId: string): Promise<ActionResult> => {
    if (!supabase) return NOT_SET_UP;
    try {
      const { error: deleteError } = await supabase.from("movies").delete().eq("id", movieId);
      if (deleteError) return { ok: false, message: deleteError.message };
      setMovies((current) => current.filter((movie) => movie.id !== movieId));
      return { ok: true };
    } catch (caught) {
      return { ok: false, message: messageFrom(caught) };
    }
  }, []);

  const setStatus = useCallback(
    async (movieId: string, status: WatchStatus, watchedAt: string | undefined): Promise<ActionResult> => {
      if (!supabase) return NOT_SET_UP;
      try {
        const { error: updateError } = await supabase
          .from("movies")
          .update({ status, watched_at: watchedAt ?? null })
          .eq("id", movieId);
        if (updateError) return { ok: false, message: updateError.message };
        setMovies((current) =>
          current.map((movie) => (movie.id === movieId ? { ...movie, status, watchedAt } : movie)),
        );
        return { ok: true };
      } catch (caught) {
        return { ok: false, message: messageFrom(caught) };
      }
    },
    [],
  );

  // Movie facts the movie service can fill in after the fact (original language,
  // English title). Only the fields given are written.
  const updateInfo = useCallback(
    async (
      movieId: string,
      patch: { language?: string; englishTitle?: string; title?: string; imdbId?: string; trailerUrl?: string },
    ): Promise<ActionResult> => {
      if (!supabase) return NOT_SET_UP;
      const columns: {
        language?: string;
        english_title?: string;
        title?: string;
        imdb_id?: string;
        trailer_url?: string;
      } = {};
      if (patch.language) columns.language = patch.language;
      if (patch.englishTitle) columns.english_title = patch.englishTitle;
      if (patch.title) columns.title = patch.title;
      if (patch.imdbId) columns.imdb_id = patch.imdbId;
      if (patch.trailerUrl) columns.trailer_url = patch.trailerUrl;
      if (!Object.keys(columns).length) return { ok: true };
      try {
        const { error: updateError } = await supabase.from("movies").update(columns).eq("id", movieId);
        if (updateError) return { ok: false, message: updateError.message };
        setMovies((current) => current.map((movie) => (movie.id === movieId ? { ...movie, ...patch } : movie)));
        return { ok: true };
      } catch (caught) {
        return { ok: false, message: messageFrom(caught) };
      }
    },
    [],
  );

  const saveRating = useCallback(
    async (movieId: string, userId: string, score: number, note: string): Promise<ActionResult> => {
      if (!supabase) return NOT_SET_UP;
      const ratedAt = new Date().toISOString();
      try {
        const { error: upsertError } = await supabase
          .from("ratings")
          .upsert(
            { movie_id: movieId, user_id: userId, score, note: note.trim(), rated_at: ratedAt },
            { onConflict: "movie_id,user_id" },
          );
        if (upsertError) return { ok: false, message: upsertError.message };
        setMovies((current) =>
          current.map((movie) =>
            movie.id === movieId
              ? { ...movie, ratings: { ...movie.ratings, [userId]: { score, note: note.trim(), ratedAt } } }
              : movie,
          ),
        );
        return { ok: true };
      } catch (caught) {
        return { ok: false, message: messageFrom(caught) };
      }
    },
    [],
  );

  return { movies, loading, error, refresh, add, remove, setStatus, updateInfo, saveRating };
};
