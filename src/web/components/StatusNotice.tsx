import clsx from 'clsx';
import type { DataStatus } from '@shared/types';
import { useI18n } from '../i18n';
import type { Messages } from '../i18n/types';
import { AlertIcon } from './icons';

const MESSAGE_KEY: Partial<Record<DataStatus, keyof Messages>> = {
  degraded: 'statusDegraded',
  error: 'statusError',
};

interface Props {
  status: DataStatus;
}

export function StatusNotice({ status }: Props) {
  const { t } = useI18n();
  const key = MESSAGE_KEY[status];
  if (!key) return null;
  const isError = status === 'error';
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        isError
          ? 'border-blood-700/50 bg-blood-900/30 text-blood-100'
          : 'border-ember-500/30 bg-ember-600/10 text-ember-400',
      )}
      role="status"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{t(key)}</p>
    </div>
  );
}

/** Shown when the live stream has dropped and is retrying; data on screen may be stale. */
export function DisconnectedNotice() {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-ember-500/30 bg-ember-600/10 px-4 py-3 text-sm text-ember-400"
      role="status"
    >
      <AlertIcon className="h-4 w-4 shrink-0" />
      <p>{t('liveReconnecting')}</p>
    </div>
  );
}
