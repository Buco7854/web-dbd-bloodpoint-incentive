import clsx from 'clsx';
import { formatMultiplier, formatPercent } from '@shared/format';
import type { Role } from '@shared/types';
import { useI18n } from '../i18n';
import { ROLE_META } from '../lib/regionTheme';
import { BloodpointIcon } from './BloodpointIcon';

interface Props {
  role: Role;
  percent: number;
  emphasized: boolean;
}

/** One role shown in BOTH formats: +X% and xY, with the Bloodpoint icon. */
export function RoleStat({ role, percent, emphasized }: Props) {
  const { t } = useI18n();
  const { labelKey, Icon, accent, emphasis } = ROLE_META[role];
  return (
    <div
      className={clsx(
        'flex items-center justify-between rounded-xl px-3 py-2 ring-1 transition-colors',
        emphasized ? emphasis : 'bg-white/[0.02] ring-white/5',
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className={clsx('h-4 w-4', emphasized ? accent : 'text-bone-500')} />
        <span className={clsx('text-sm font-medium', emphasized ? 'text-bone-100' : 'text-bone-400')}>
          {t(labelKey)}
        </span>
      </span>
      <span className="flex items-center gap-2.5 tabular">
        <span className={clsx('text-sm font-semibold', emphasized ? accent : 'text-bone-300')}>
          {formatPercent(percent)}
        </span>
        <span className="flex items-center gap-1 text-xs text-bone-500">
          <BloodpointIcon className="h-3.5 w-3.5" />
          {formatMultiplier(percent)}
        </span>
      </span>
    </div>
  );
}
