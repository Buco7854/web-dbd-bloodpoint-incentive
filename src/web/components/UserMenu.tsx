import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi } from '../auth/authApi';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { KeyIcon, ShieldIcon } from './icons';

interface Props {
  onAdmin: () => void;
  onAccount: () => void;
  onLogin: () => void;
  onHome: () => void;
}

/**
 * Navbar account menu: groups the account/MFA page, the admin link, and sign-out into
 * one dropdown (a "Sign in" button when signed out), so the bar stays uncluttered.
 */
export function UserMenu({ onAdmin, onAccount, onLogin, onHome }: Props) {
  const { authenticated, user, csrfToken, refresh } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (fn: () => void): void => {
    setOpen(false);
    fn();
  };

  const signOut = (): void => {
    setOpen(false);
    void authApi
      .logout(csrfToken ?? '')
      .catch(() => {})
      .then(() => refresh())
      .then(() => onHome());
  };

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={onLogin}
        className="hidden h-9 items-center gap-2 rounded-xl border border-white/10 bg-void-700/70 px-3 text-sm font-medium text-bone-300 transition hover:border-white/20 hover:text-bone-100 sm:inline-flex"
      >
        {t('loginSignIn')}
      </button>
    );
  }

  const name = user?.username || user?.email || user?.name || '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('navAccount')}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold transition',
          open ? 'border-white/20 bg-blood-600/20 text-bone-100' : 'border-white/10 bg-void-700/70 text-bone-200 hover:border-white/20 hover:text-bone-100',
        )}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-void-800 shadow-card">
          <div className="border-b border-white/5 px-3 py-3">
            <p className="truncate text-sm text-bone-100">{name || t('navAccount')}</p>
            <span
              className={clsx(
                'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                isAdmin ? 'bg-blood-600/20 text-blood-200' : 'bg-white/5 text-bone-400',
              )}
            >
              {isAdmin ? t('adminRoleAdmin') : t('adminRoleUser')}
            </span>
          </div>
          <div className="p-1.5">
            <MenuButton icon={<KeyIcon className="h-4 w-4" />} onClick={() => run(onAccount)}>
              {t('navAccount')}
            </MenuButton>
            {isAdmin && (
              <MenuButton icon={<ShieldIcon className="h-4 w-4" />} onClick={() => run(onAdmin)}>
                {t('adminNav')}
              </MenuButton>
            )}
          </div>
          <div className="border-t border-white/5 p-1.5">
            <MenuButton onClick={signOut}>{t('adminSignOut')}</MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon, onClick, children }: { icon?: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-bone-300 transition hover:bg-white/5 hover:text-bone-100"
    >
      {icon}
      {children}
    </button>
  );
}
