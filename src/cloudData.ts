import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { CloudMember, CloudRoom } from "./types";

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
