import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BodyPlatform } from '@shared/platforms';
import type { IncentivesPayload } from '@shared/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { REPO_URL } from '../lib/links';
import { LanguageSelector } from './LanguageSelector';
import { PlatformSelector } from './PlatformSelector';
import { CloseIcon, GitHubIcon, MenuIcon, UsersIcon } from './icons';

interface Props {
  data: IncentivesPayload | null;
  onRegister: () => void;
  onPlatform: (p: BodyPlatform) => void;
  onLogin: () => void;
}

/**
 * Mobile-only (`sm:hidden`) hamburger that slides in a drawer holding the header
 * controls (platform, contribute, language, source) so the navbar doesn't overflow
 * on small screens. The refresh button and account menu stay in the bar, to its left.
 */
export function MobileMenu({ data, onRegister, onPlatform, onLogin }: Props) {
  const { t } = useI18n();
  const { authenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const itemClass =
    'inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-void-700/70 px-2.5 text-sm font-medium text-bone-300 transition hover:border-white/20 hover:text-bone-100';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('menu')}
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-void-700/70 text-bone-300 transition hover:border-white/20 hover:text-bone-100"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          // Portaled to <body>: the header's backdrop-filter would otherwise pin
          // this fixed overlay to the header box instead of the viewport.
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label={t('menuClose')}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60"
            />
            <div className="absolute right-0 top-0 flex h-full w-64 max-w-[82%] flex-col gap-3 overflow-y-auto border-l border-white/10 bg-void-900 p-4 shadow-card">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('menuClose')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-void-700/70 text-bone-300 transition hover:border-white/20 hover:text-bone-100"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              {data && (
                <PlatformSelector platforms={data.platforms} current={data.platform} onChange={onPlatform} />
              )}

              {data?.contributeEnabled && (
                <button type="button" onClick={go(onRegister)} className={itemClass}>
                  <UsersIcon className="h-4 w-4" />
                  {t('registerNav')}
                </button>
              )}

              <LanguageSelector fullWidth />

              <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={itemClass}>
                <GitHubIcon className="h-[18px] w-[18px]" />
                GitHub
              </a>

              {!authenticated && (
                <button type="button" onClick={go(onLogin)} className={itemClass}>
                  {t('loginSignIn')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
