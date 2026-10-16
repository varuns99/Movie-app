import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

// The signed-in person's name and avatar. Opens a small menu: their email (just
// text), the room settings, and sign out.
export function ProfileMenu({
  name,
  email,
  onRoomSettings,
  onSignOut,
}: {
  name: string;
  email: string;
  onRoomSettings: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="profile" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-name">{name}</span>
        <Avatar size={32} />
      </button>
      {open && (
        <div className="profile-menu" role="menu" aria-label="Your account">
          <p className="profile-email">{email}</p>
          <button type="button" role="menuitem" onClick={choose(onRoomSettings)}>
            Room settings
          </button>
          <button type="button" role="menuitem" onClick={choose(onSignOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
