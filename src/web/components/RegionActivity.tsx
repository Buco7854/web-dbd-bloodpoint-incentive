import { useMemo } from 'react';
import { formatPercent } from '@shared/format';
import type { ReadingEntry } from '@shared/types';
import { useI18n } from '../i18n';
import { ROLE_META } from '../lib/regionTheme';

interface Props {
  recent: ReadingEntry[];
  changes: ReadingEntry[];
  loading: boolean;
}

function ValueChip({ survivor, killer, ratio }: { survivor: number; killer: number; ratio: number }) {
  const { t } = useI18n();
  const s = ROLE_META.survivor;
  const k = ROLE_META.killer;
  return (
    <span className="flex items-center gap-3 tabular">
      <span className="flex items-center gap-1" title={t('roleSurvivor')}>
        <s.Icon className={`h-3.5 w-3.5 ${s.accent}`} />
        <span className="text-bone-200">{formatPercent(survivor)}</span>
      </span>
      <span className="flex items-center gap-1" title={t('roleKiller')}>
        <k.Icon className={`h-3.5 w-3.5 ${k.accent}`} />
        <span className="text-bone-200">{formatPercent(killer)}</span>
      </span>
      <span className="text-xs text-bone-500" title={t('ratio', { value: ratio.toFixed(2) })}>
        {t('ratio', { value: ratio.toFixed(2) })}
      </span>
    </span>
  );
}

function Panel({
  title,
  rows,
  loading,
  fmt,
}: {
  title: string;
  rows: ReadingEntry[];
  loading: boolean;
  fmt: (t: number) => string;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-white/10 bg-void-800/50 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold tracking-wide text-bone-100">{title}</h2>
      {loading ? (
        <ul className="mt-3 space-y-2" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="h-5 animate-pulse rounded bg-white/5" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-bone-500">{t('activityEmpty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/5">
          {rows.map((r) => (
            <li key={r.t} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-bone-400">{fmt(r.t)}</span>
              <ValueChip survivor={r.survivor} killer={r.killer} ratio={r.ratio} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Two side-by-side lists: the latest raw readings and the recent change points. */
export function RegionActivity({ recent, changes, loading }: Props) {
  const { t, lang } = useI18n();
  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
    return (ms: number) => f.format(new Date(ms));
  }, [lang]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel title={t('activityRecentTitle')} rows={recent} loading={loading} fmt={fmt} />
      <Panel title={t('activityChangesTitle')} rows={changes} loading={loading} fmt={fmt} />
    </div>
  );
}
