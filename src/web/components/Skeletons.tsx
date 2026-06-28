export function Shimmer() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
  );
}

/** Loading placeholder sized like the history chart (matches its responsive height). */
export function ChartSkeleton() {
  return (
    <div className="relative h-72 overflow-hidden rounded-xl bg-void-700/40 sm:h-80">
      <Shimmer />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="relative h-64 overflow-hidden rounded-2xl border border-white/5 bg-void-700/50 p-5">
      <Shimmer />
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-white/5" />
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-white/5" />
          <div className="h-2.5 w-20 rounded bg-white/5" />
        </div>
      </div>
      <div className="mt-6 h-12 w-28 rounded bg-white/5" />
      <div className="mt-6 space-y-2">
        <div className="h-9 rounded-xl bg-white/[0.03]" />
        <div className="h-9 rounded-xl bg-white/[0.03]" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
