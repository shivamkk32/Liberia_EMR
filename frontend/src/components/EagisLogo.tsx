// Platform brand mark — a heart (blue→green gradient) with a white stethoscope.
// Recreated as inline SVG so it's self-contained and scales crisply.

let gradSeq = 0;

export default function EagisLogo({ size = 34 }: { size?: number }) {
  // Unique gradient id per instance to avoid collisions when rendered twice.
  const gid = `eagisGrad${gradSeq++}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="National EMR by Francordsoft">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f86e0" />
          <stop offset="0.55" stopColor="#33b3b8" />
          <stop offset="1" stopColor="#37cf94" />
        </linearGradient>
      </defs>
      {/* Heart */}
      <path
        d="M32 57 C 9 41 5 24 17.5 16.5 C 25 12 31 16 32 22 C 33 16 39 12 46.5 16.5 C 59 24 55 41 32 57 Z"
        fill={`url(#${gid})`}
      />
      {/* Stethoscope: binaural tubes + chestpiece, in white */}
      <g fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19.5 C 20.5 29 27.5 33 32 35 C 36.5 33 43.5 29 41 19.5" />
        <path d="M32 35 C 31 41 27 41.5 27 44.5" />
      </g>
      <circle cx="23" cy="18.6" r="2.4" fill="#ffffff" />
      <circle cx="41" cy="18.6" r="2.4" fill="#ffffff" />
      <circle cx="27" cy="46.6" r="3.4" fill="#ffffff" />
      <circle cx="27" cy="46.6" r="1.5" fill={`url(#${gid})`} />
    </svg>
  );
}
