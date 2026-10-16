// A generic person: an outlined head and shoulders inside an outlined circle,
// drawn in the brand green.
export function Avatar({ size = 32 }: { size?: number }) {
  return (
    <svg className="avatar" viewBox="0 0 64 64" width={size} height={size} fill="none" aria-hidden="true">
      <defs>
        <clipPath id="avatar-clip">
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="29" fill="var(--accent)" fillOpacity="0.14" />
      <g clipPath="url(#avatar-clip)" stroke="var(--accent)" strokeWidth="3.5" strokeLinejoin="round">
        {/* Head */}
        <path d="M32 13c6.2 0 9.6 5 9.6 11.6 0 5.8-3 11.4-5.6 12.2h-8c-2.6-.8-5.6-6.4-5.6-12.2C22.4 18 25.8 13 32 13Z" />
        {/* Shoulders */}
        <path d="M6 58c1-8.8 9.4-12.2 17.4-13.4 1.2-.2 2.4-.9 2.6-2.2M58 58c-1-8.8-9.4-12.2-17.4-13.4-1.2-.2-2.4-.9-2.6-2.2" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="32" r="29" stroke="var(--accent)" strokeWidth="3.5" />
    </svg>
  );
}
