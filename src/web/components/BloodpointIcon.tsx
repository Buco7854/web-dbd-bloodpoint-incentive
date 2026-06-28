interface Props {
  className?: string;
}

/** Original Bloodpoint recreation, not Behaviour's official asset, so the app stays self-contained. */
export function BloodpointIcon({ className = 'h-6 w-6' }: Props) {
  return (
    <svg viewBox="0 -0.45 32 32" className={className} role="img" aria-label="Bloodpoints" fill="none">
      <defs>
        <radialGradient id="bp-core" cx="42%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ff9a9a" />
          <stop offset="36%" stopColor="#ec2230" />
          <stop offset="76%" stopColor="#a30f17" />
          <stop offset="100%" stopColor="#560a0e" />
        </radialGradient>
        <linearGradient id="bp-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff7a7a" />
          <stop offset="100%" stopColor="#360608" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2C18.9 7 25.5 13.6 25.5 19.4A9.5 9.5 0 1 1 6.5 19.4C6.5 13.6 13.1 7 16 2.2Z"
        fill="url(#bp-rim)"
      />
      <path
        d="M16 4.2C18.5 8.4 23.7 14.1 23.7 19.4A7.7 7.7 0 1 1 8.3 19.4C8.3 14.1 13.5 8.4 16 4.2Z"
        fill="url(#bp-core)"
      />
      <ellipse
        cx="12.4"
        cy="14"
        rx="1.9"
        ry="3"
        fill="#ffffff"
        opacity="0.38"
        transform="rotate(-26 12.4 14)"
      />
      <circle cx="19.6" cy="21.6" r="1.4" fill="#ffffff" opacity="0.16" />
    </svg>
  );
}
