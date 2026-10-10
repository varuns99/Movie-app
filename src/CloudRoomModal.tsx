import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import { DEFAULT_ROOM_NAME, createRoom, joinRoom, renameMember, renameRoom } from "./cloudData";
import type { CloudMember, CloudRoom } from "./types";

type CloudRoomModalProps = {
  userId: string;
  defaultName: string;
  room: CloudRoom | null;
  members: CloudMember[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  onClose: () => void;
};

export function CloudRoomModal({
  userId,
  defaultName,
  room,
  members,
  loading,
  error: loadError,
  refresh,
  onClose,
}: CloudRoomModalProps) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async (label: string, action: () => Promise<{ ok: true } | { ok: false; message: string }>, done = "") => {
    setBusy(label);
    setError("");
    setNotice("");
    const result = await action();
    if (result.ok) {
      await refresh();
      setNotice(done);
    } else {
      setError(result.message);
    }
    setBusy("");
  };

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("create", () => createRoom(String(form.get("roomName") || ""), String(form.get("memberName") || "")));
  };

  const onJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("join", () => joinRoom(String(form.get("code") || ""), String(form.get("memberName") || "")));
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy automatically. Select the code and copy it by hand.");
    }
  };

  if (loading && !room) {
    return (
      <Modal title="Your room" onClose={onClose}>
        <div className="modal-form">
          <p className="account-email">Loading your room...</p>
        </div>
      </Modal>
    );
  }

  if (!room) {
    return (
      <Modal title="Set up your room" onClose={onClose}>
        <div className="modal-form">
          {loadError && <p className="auth-message error">{loadError}</p>}
          {error && <p className="auth-message error">{error}</p>}

          <form className="room-section" onSubmit={onCreate}>
            <h3>Create a room</h3>
            <label>
              Room name
              <input name="roomName" defaultValue={DEFAULT_ROOM_NAME} maxLength={80} />
            </label>
            <label>
              Your name
              <input name="memberName" defaultValue={defaultName} required maxLength={40} />
            </label>
            <button className="primary-button" type="submit" disabled={Boolean(busy)}>
              {busy === "create" ? "Creating..." : "Create room"}
            </button>
            <p className="room-hint">You'll get an invite code to share with your partner.</p>
          </form>

          <form className="room-section" onSubmit={onJoin}>
            <h3>Join with an invite code</h3>
            <label>
              Invite code
              <input name="code" required maxLength={12} autoCapitalize="characters" placeholder="ABCD2345" />
            </label>
            <label>
              Your name
              <input name="memberName" defaultValue={defaultName} required maxLength={40} />
            </label>
            <button type="submit" disabled={Boolean(busy)}>
              {busy === "join" ? "Joining..." : "Join room"}
            </button>
          </form>
        </div>
      </Modal>
    );
  }

  const me = members.find((member) => member.userId === userId);

  return (
    <Modal title="Your room" onClose={onClose}>
      <div className="modal-form">
        {loadError && <p className="auth-message error">{loadError}</p>}
        {error && <p className="auth-message error">{error}</p>}
        {notice && <p className="auth-message">{notice}</p>}

        <form
          className="room-section"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("roomName") || "");
            run("rename", () => renameRoom(room.id, name), "Room name saved.");
          }}
        >
          <label>
            Room name
            <input key={room.name} name="roomName" defaultValue={room.name} maxLength={80} />
          </label>
          <button type="submit" disabled={Boolean(busy)}>
            {busy === "rename" ? "Saving..." : "Save name"}
          </button>
        </form>

        <div className="room-section">
          <h3>Invite your partner</h3>
          <p className="room-hint">Send them this code. They sign up, then choose "Join with an invite code".</p>
          <div className="invite-row">
            <span className="invite-code" aria-label="Invite code">
              {room.inviteCode}
            </span>
            <button type="button" onClick={copyCode}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="room-section">
          <h3>In this room</h3>
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <span>{member.displayName}</span>
                {member.userId === userId && <small>you</small>}
              </li>
            ))}
          </ul>
          {members.length < 2 && <p className="room-hint">Just you so far. Share the invite code above.</p>}
        </div>

        <form
          className="room-section"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("memberName") || "");
            run("name", () => renameMember(room.id, userId, name), "Your name saved.");
          }}
        >
          <label>
            Your name in this room
            <input key={me?.displayName} name="memberName" defaultValue={me?.displayName ?? defaultName} required maxLength={40} />
          </label>
          <button type="submit" disabled={Boolean(busy)}>
            {busy === "name" ? "Saving..." : "Save my name"}
          </button>
        </form>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
