import clsx from 'clsx';
import type { DataStatus, IncentivesPayload } from '@shared/types';
import { useI18n } from '../i18n';
import { formatRelativeTime } from '../i18n/time';

const STATUS_DOT: Record<DataStatus, string> = {
  ok: 'bg-emerald-400',
  degraded: 'bg-ember-500',
  error: 'bg-blood-500',
  initializing: 'bg-bone-500',
};

/** Round freshness indicator: colour by status, with a pulsing ring once it's not fresh. */
export function FreshnessDot({ status, className }: { status: DataStatus; className?: string }) {
  const color = STATUS_DOT[status];
  return (
    <span className={clsx('relative inline-flex h-2 w-2', className)}>
      {status !== 'ok' && (
        <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />
      )}
      <span className={clsx('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

/** "● Last update · 2m ago" - the freshness of the newest reading on this platform. */
export function FreshnessChip({
  data,
  now,
  className,
}: {
  data: IncentivesPayload;
  now: number;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={clsx('inline-flex items-center gap-2 text-xs text-bone-400', className)}>
      <FreshnessDot status={data.status} />
      <span>
        {t('lastUpdate')} · {formatRelativeTime(data.updatedAt, now, t)}
      </span>
    </span>
  );
}
