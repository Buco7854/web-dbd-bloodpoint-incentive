import clsx from 'clsx';
import type { RegionIncentive } from '@shared/types';
import { Flag } from './Flag';

interface Props {
  region: RegionIncentive;
  size?: 'card' | 'hero';
}

/** Flag + display name + region id, shared by the card and hero layouts. */
export function RegionLabel({ region, size = 'card' }: Props) {
  const hero = size === 'hero';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Flag
        region={region.region}
        className={clsx('shrink-0', hero ? 'h-7 w-[42px]' : 'h-5 w-[30px]')}
      />
      <div className="min-w-0">
        <h3
          className={clsx(
            'break-words font-display font-semibold leading-tight tracking-wide text-bone-100',
            hero ? 'text-2xl sm:text-3xl' : 'text-lg',
          )}
        >
          {region.displayName}
        </h3>
        <p className="truncate font-mono text-[11px] text-bone-500">{region.region}</p>
      </div>
    </div>
  );
}
