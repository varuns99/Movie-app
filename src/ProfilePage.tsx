import { Avatar } from "./Avatar";

// The Profile section: who is signed in, room settings and sign out, the
// install button, and TheTVDB's credit. Signed out, the same page is greyed out
// behind a card asking the person to sign in.
export function ProfilePage({
  name,
  email,
  onRoomSettings,
  onSignOut,
  onSignIn,
  install,
}: {
  // Missing while signed out.
  name?: string;
  email?: string;
  onRoomSettings: () => void;
  onSignOut: () => void;
  // Opens the sign-in window. Omit when accounts are not set up for this site.
  onSignIn?: () => void;
  install: { canInstall: boolean; install: () => void; iosHint: boolean };
}) {
  const signedIn = name !== undefined;

  return (
    <section className="profile-page">
      <div className="profile-body">
        <div className={signedIn ? "profile-card" : "profile-card greyed"} inert={!signedIn} aria-hidden={!signedIn || undefined}>
          <Avatar size={112} />
          <h2 className="profile-page-name">{signedIn ? name : "Guest"}</h2>
          <p className="profile-page-email">{signedIn ? email : "Not signed in"}</p>
          <div className="profile-actions">
            <button type="button" onClick={onRoomSettings}>
              Room settings
            </button>
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
        {!signedIn && (
          <div className="profile-signin">
            <strong>Sign in to access all features</strong>
            <p>Your shared watchlist, ratings and history, on any device.</p>
            {onSignIn && (
              <button type="button" className="primary-button" onClick={onSignIn}>
                Sign in
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="profile-footer">
        {install.canInstall && (
          <button type="button" onClick={install.install}>
            Install app
          </button>
        )}
        {!install.canInstall && install.iosHint && <p>To install: tap Share, then Add to Home Screen.</p>}
        <p>
          Movie data from{" "}
          <a href="https://thetvdb.com" target="_blank" rel="noreferrer">
            TheTVDB.com
          </a>
          . This product is not endorsed or certified by TheTVDB.
        </p>
      </footer>
    </section>
  );
}
