import { useState } from 'react';
import { useI18n } from '../i18n';
import { CloseIcon } from './icons';

const STORAGE_KEY = 'dbd-bp-disclaimer-dismissed';

interface Props {
  contactEmail: string | null;
}

/** Shown to first-time visitors until dismissed (remembered in localStorage). */
export function DisclaimerBanner({ contactEmail }: Props) {
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
    <aside role="complementary" className="disclaimer border-b border-amber-400/25 bg-amber-400/[0.08]">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 sm:px-6">
        <p className="flex-1 text-xs leading-relaxed text-amber-50/85">
          {t('bannerDisclaimer')} {t('bannerNice')}
          {contactEmail && (
            <>
              {' '}
              {t('bannerContact', { email: contactEmail })}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('bannerDismiss')}
          title={t('bannerDismiss')}
          className="-mr-1 shrink-0 rounded-md p-1.5 text-amber-200/70 transition hover:bg-amber-400/15 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
