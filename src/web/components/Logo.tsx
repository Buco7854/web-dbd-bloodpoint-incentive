import { BloodpointIcon } from './BloodpointIcon';

function Slashes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 16" className={className} fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M2 14 10 2" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 14 19 2" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 14 27 3" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ onHome }: { onHome?: () => void }) {
  return (
    <a
      href="/"
      onClick={(e) => {
        if (onHome) {
          e.preventDefault();
          onHome();
        }
      }}
      aria-label="Bloodpoint Incentives home"
      className="flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blood-500/40 sm:gap-3"
    >
      <BloodpointIcon className="h-8 w-8 shrink-0 drop-shadow-[0_0_10px_rgba(224,30,43,0.55)] sm:h-9 sm:w-9" />
      <div className="min-w-0 leading-[0.95]">
        <div className="truncate font-display text-lg font-semibold tracking-[0.1em] text-bone-100 sm:text-[1.3rem] sm:tracking-[0.16em]">
          BLOODPOINT
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-display text-[0.65rem] tracking-[0.28em] text-blood-500 sm:text-xs sm:tracking-[0.38em]">
            INCENTIVES
          </span>
          <Slashes className="hidden h-3 w-6 text-bone-300/60 sm:block" />
        </div>
      </div>
    </a>
  );
}
