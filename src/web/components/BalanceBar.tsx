import { useI18n } from '../i18n';

interface Props {
  ratio: number;
}

/** Visualises the killer:survivor queue ratio; higher ratio grows the killer segment. */
export function BalanceBar({ ratio }: Props) {
  const { t } = useI18n();
  const killerShare = ratio > 0 ? Math.min(0.9, Math.max(0.1, ratio / (ratio + 1))) : 0.5;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-bone-500">
        <span>{t('roleSurvivor')}</span>
        <span className="tabular text-bone-400">{t('ratio', { value: ratio.toFixed(2) })}</span>
        <span>{t('roleKiller')}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-void-600 ring-1 ring-white/5">
        <div className="bg-survivor/70" style={{ width: `${(1 - killerShare) * 100}%` }} />
        <div className="bg-blood-500/80" style={{ width: `${killerShare * 100}%` }} />
      </div>
    </div>
  );
}
