// The "Trailer" button, with a small play triangle before the word.
export function TrailerButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="trailer-button" onClick={onClick}>
      <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true">
        <path d="M0 0.8 9.5 6 0 11.2Z" fill="currentColor" />
      </svg>
      Trailer
    </button>
  );
}
