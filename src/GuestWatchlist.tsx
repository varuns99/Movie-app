import { SignInCard } from "./SignInCard";

// The Watchlist while signed out: an empty, greyed-out preview of the page with a
// card asking the person to sign in.
export function GuestWatchlist({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <section className="guest-page">
      <div className="guest-watchlist greyed" inert aria-hidden="true">
        <div className="guest-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search a movie or series to add
        </div>
        <div className="section-heading">
          <h2>Watchlist</h2>
          <span>Shared with your partner</span>
        </div>
        <div className="guest-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="guest-card">
              <div className="guest-poster" />
              <div className="guest-line" />
              <div className="guest-line short" />
            </div>
          ))}
        </div>
      </div>
      <SignInCard
        body="Save movies and series, rate them together and keep a history of what you've watched, on any device."
        onSignIn={onSignIn}
      />
    </section>
  );
}
