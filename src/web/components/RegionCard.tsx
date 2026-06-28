import { memo, type MouseEvent } from 'react';
import clsx from 'clsx';
import { headlineRole } from '@shared/incentive';
import type { RegionIncentive } from '@shared/types';
import { useI18n } from '../i18n';
import { formatUpdated } from '../i18n/time';
import { CARD_GRADIENT } from '../lib/regionTheme';
import { Badge } from './Badge';
import { BalanceBar } from './BalanceBar';
import { BonusHeadline } from './BonusHeadline';
import { ChartIcon, PinIcon } from './icons';
import { RegionLabel } from './RegionLabel';
import { RoleStat } from './RoleStat';

interface Props {
  region: RegionIncentive;
  now: number;
  /** True for the visitor's most-likely matchmaking region (lowest latency). */
  isUserRegion?: boolean;
  /** Opens the region's history page (also a real `/region/<id>` link). */
  onOpen?: (regionId: string) => void;
}

// Memoized: the grid feeds a coarse (30s) clock, so cards only re-render when their
// region data or the coarse time actually changes, not on every 1s dashboard tick.
export const RegionCard = memo(function RegionCard({ region, now, isUserRegion = false, onOpen }: Props) {
  const { t } = useI18n();
  const activeRole = headlineRole(region.survivor, region.killer);
  const themeKey = activeRole ?? 'none';
  const neverReal = !region.isReal && region.lastUpdated === null;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    // Let modifier/middle clicks open a new tab the native way.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onOpen?.(region.region);
  };

  return (
    <a
      href={`/region/${encodeURIComponent(region.region)}`}
      onClick={handleClick}
      aria-label={`${region.displayName}: ${t('regionDetails')}`}
      className={clsx(
        'group flex animate-fade-up flex-col gap-4 rounded-2xl border bg-gradient-to-br p-5 shadow-card transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blood-500/50',
        CARD_GRADIENT[themeKey],
        isUserRegion && 'ring-2 ring-blood-400/70',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <RegionLabel region={region} />
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isUserRegion && (
            <Badge tone="blood" title={t('yourRegionHint')}>
              <PinIcon className="h-3.5 w-3.5" />
              {t('yourRegion')}
            </Badge>
          )}
          {region.stale && !neverReal && <Badge tone="amber">{t('badgeStale')}</Badge>}
          {neverReal && <Badge tone="neutral">{t('badgeNoData')}</Badge>}
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <BonusHeadline region={region} size="card" />

        <div className="grid gap-2">
          {/* Emphasize every role that actually carries a bonus, so the rare case
              of both survivor AND killer having one lights up both rows. */}
          <RoleStat role="survivor" percent={region.survivor} emphasized={region.survivor > 0} />
          <RoleStat role="killer" percent={region.killer} emphasized={region.killer > 0} />
        </div>

        {region.isReal && <BalanceBar ratio={region.ratio} />}
      </div>

      <footer className="flex items-center justify-between gap-2 pt-1 text-[11px] text-bone-500">
        <span>{formatUpdated(region.lastUpdated, now, t)}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-blood-300 transition group-hover:text-blood-200 group-focus-visible:text-blood-200">
          <ChartIcon className="h-3.5 w-3.5" />
          {t('regionDetails')}
        </span>
      </footer>
    </a>
  );
});
