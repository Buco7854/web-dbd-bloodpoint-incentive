import clsx from 'clsx';
import type { BodyPlatform } from '@shared/platforms';
import type { IncentivesPayload } from '@shared/types';
import { useI18n } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import { Logo } from './Logo';
import { MobileMenu } from './MobileMenu';
import { PlatformSelector } from './PlatformSelector';
import { UserMenu } from './UserMenu';
import { REPO_URL } from '../lib/links';
import { GitHubIcon, RefreshIcon, UsersIcon } from './icons';

interface Props {
  data: IncentivesPayload | null;
  onRefresh: () => void;
  refreshing: boolean;
  onRegister: () => void;
  onHome: () => void;
  onPlatform: (p: BodyPlatform) => void;
  onAdmin: () => void;
  onAccount: () => void;
  onLogin: () => void;
}

export function Header({ data, onRefresh, refreshing, onRegister, onHome, onPlatform, onAdmin, onAccount, onLogin }: Props) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-void-900/80 backdrop-blur supports-[backdrop-filter]:bg-void-900/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <Logo onHome={onHome} />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Desktop controls; on mobile these move into the hamburger drawer. */}
          <div className="hidden items-center gap-2 sm:flex sm:gap-3">
            {data && (
              <PlatformSelector platforms={data.platforms} current={data.platform} onChange={onPlatform} />
            )}
            {data?.contributeEnabled && (
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-void-700/70 px-2.5 text-sm font-medium text-bone-300 transition hover:border-white/20 hover:text-bone-100"
              >
                <UsersIcon className="h-4 w-4" />
                {t('registerNav')}
              </button>
            )}
            <LanguageSelector />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-void-700/70 text-bone-300 transition hover:border-white/20 hover:text-bone-100"
            >
              <GitHubIcon className="h-[18px] w-[18px]" />
            </a>
          </div>

          {/* Refresh stays in the bar at all sizes (on mobile, left of the menu). */}
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('refreshAria')}
            title={t('refreshAria')}
            className={clsx(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-void-700/70 text-bone-300 transition hover:border-white/20 hover:text-bone-100',
              refreshing && 'animate-spin',
            )}
          >
            <RefreshIcon className="h-4 w-4" />
          </button>

          <UserMenu onAdmin={onAdmin} onAccount={onAccount} onLogin={onLogin} onHome={onHome} />

          <MobileMenu data={data} onRegister={onRegister} onPlatform={onPlatform} onLogin={onLogin} />
        </div>
      </div>
    </header>
  );
}
