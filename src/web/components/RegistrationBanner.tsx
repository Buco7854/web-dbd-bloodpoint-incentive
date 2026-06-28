import { useState } from 'react';
import { useI18n } from '../i18n';
import { CloseIcon, UsersIcon } from './icons';

const STORAGE_KEY = 'dbd-bp-register-dismissed';

interface Props {
  onRegister: () => void;
}

/** Invites visitors to run a data agent. Dismissal is remembered in localStorage. */
export function RegistrationBanner({ onRegister }: Props) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="border-b border-blood-500/25 bg-blood-600/[0.08]">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <UsersIcon className="hidden h-4 w-4 shrink-0 text-blood-300 sm:block" />
        <p className="flex-1 text-xs leading-relaxed text-bone-200">
          <span className="font-semibold text-bone-100">{t('registerBannerTitle')}</span>{' '}
          {t('registerBannerBody')}{' '}
          <button
            type="button"
            onClick={onRegister}
            className="font-medium text-blood-300 underline-offset-2 hover:text-blood-200 hover:underline"
          >
            {t('registerBannerCta')}
          </button>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('registerBannerDismiss')}
          title={t('registerBannerDismiss')}
          className="-mr-1 shrink-0 rounded-md p-1.5 text-bone-400 transition hover:bg-white/5 hover:text-bone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blood-500/40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
