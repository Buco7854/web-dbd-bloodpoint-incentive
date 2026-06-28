import { useI18n } from '../i18n';
import { AlertIcon, RefreshIcon } from './icons';

interface Props {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-blood-800/40 bg-blood-900/20 py-16 text-center">
      <AlertIcon className="h-10 w-10 text-blood-400" />
      <div>
        <p className="font-display text-xl text-bone-100">{t('errorTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-bone-400">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-void-600/70 px-4 py-2 text-sm text-bone-100 transition hover:bg-void-600"
      >
        <RefreshIcon className="h-4 w-4" /> {t('tryAgain')}
      </button>
    </div>
  );
}
