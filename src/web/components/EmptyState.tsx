import { useI18n } from '../i18n';
import { BloodpointIcon } from './BloodpointIcon';

interface Props {
  onReset?: () => void;
}

export function EmptyState({ onReset }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-void-700/40 py-16 text-center">
      <BloodpointIcon className="h-10 w-10 opacity-40" />
      <p className="font-display text-xl text-bone-200">{t('emptyTitle')}</p>
      <p className="max-w-sm text-sm text-bone-500">{t('emptyBody')}</p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 rounded-xl border border-white/10 bg-void-600/70 px-4 py-2 text-sm text-bone-100 transition hover:bg-void-600"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  );
}
