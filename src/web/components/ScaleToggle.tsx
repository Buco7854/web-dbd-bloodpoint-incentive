import clsx from 'clsx';
import type { HistoryScale } from '@shared/types';
import { useI18n } from '../i18n';
import type { Messages } from '../i18n/types';

const OPTIONS: { value: HistoryScale; labelKey: keyof Messages }[] = [
  { value: 'hourly', labelKey: 'scaleHourly' },
  { value: 'daily', labelKey: 'scaleDaily' },
  { value: 'weekly', labelKey: 'scaleWeekly' },
  { value: 'monthly', labelKey: 'scaleMonthly' },
  { value: 'yearly', labelKey: 'scaleYear' },
];

interface Props {
  /** The active scale, or null when the user has zoomed/panned to a custom window. */
  value: HistoryScale | null;
  onChange: (scale: HistoryScale) => void;
}

/** Segmented control for the history time scale (Hourly / Daily / Weekly / Monthly). */
export function ScaleToggle({ value, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('scaleLabel')}
      className="grid w-full grid-cols-5 gap-1 rounded-xl border border-white/10 bg-void-800/60 p-1 sm:inline-grid sm:w-auto"
    >
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-lg px-2 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blood-500/50 sm:px-4 sm:text-sm',
              active
                ? 'bg-blood-600/20 text-bone-100 shadow-sm ring-1 ring-blood-500/40'
                : 'text-bone-400 hover:text-bone-100',
            )}
          >
            {t(o.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
