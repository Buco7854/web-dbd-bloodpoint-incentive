import clsx from 'clsx';
import { formatMultiplier, formatPercent } from '@shared/format';
import { headlinePercent, headlineRole } from '@shared/incentive';
import type { RegionIncentive } from '@shared/types';
import { useI18n } from '../i18n';
import { HEADLINE_COLOR } from '../lib/regionTheme';

type Size = 'card' | 'hero';

const SIZES: Record<Size, { num: string; none: string; sub: string }> = {
  card: { num: 'text-5xl', none: 'text-2xl', sub: 'text-sm' },
  hero: { num: 'text-6xl sm:text-7xl', none: 'text-4xl', sub: 'text-base' },
};

interface Props {
  region: RegionIncentive;
  size: Size;
}

/** The headline number (the higher role's bonus), centered with its caption. */
export function BonusHeadline({ region, size }: Props) {
  const { t } = useI18n();
  const activeRole = headlineRole(region.survivor, region.killer);
  const headline = headlinePercent(region.survivor, region.killer);
  const s = SIZES[size];

  if (!activeRole) {
    return (
      <div className="text-center">
        <div className={clsx('font-display font-semibold text-bone-200', s.none)}>{t('noBonus')}</div>
        <div className={clsx('text-bone-500', s.sub)}>{t('noBonusSub')}</div>
      </div>
    );
  }

  const subKey = activeRole === 'survivor' ? 'survivorBonus' : 'killerBonus';
  return (
    <div className="text-center">
      <div className={clsx('font-display font-bold leading-none tabular', s.num, HEADLINE_COLOR[activeRole])}>
        {formatPercent(headline)}
      </div>
      <div className={clsx('mt-2 text-bone-400', s.sub)}>
        {t(subKey, { mult: formatMultiplier(headline) })}
      </div>
    </div>
  );
}
