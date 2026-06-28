import type { RegionIncentive } from '@shared/types';
import { RegionCard } from './RegionCard';

interface Props {
  regions: RegionIncentive[];
  now: number;
  /** The visitor's most-likely region (lowest latency), highlighted if present. */
  userRegion?: string | null;
  /** Opens a region's history page. */
  onOpen?: (regionId: string) => void;
}

export function RegionGrid({ regions, now, userRegion, onOpen }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {regions.map((region) => (
        <RegionCard
          key={region.region}
          region={region}
          now={now}
          isUserRegion={region.region === userRegion}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
