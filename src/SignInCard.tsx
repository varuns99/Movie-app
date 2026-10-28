// Shown over a greyed-out page while signed out (Watchlist, Profile).
export function SignInCard({ body, onSignIn }: { body: string; onSignIn?: () => void }) {
  return (
    <div className="signin-card">
      <strong>Sign in to access all features</strong>
      <p>{body}</p>
      {onSignIn && (
        <button type="button" className="primary-button" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </div>
  );
}
