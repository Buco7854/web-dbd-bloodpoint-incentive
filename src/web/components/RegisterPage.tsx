import { useEffect, useState } from 'react';
import { type BodyPlatform, DEFAULT_PLATFORM, PLATFORMS } from '@shared/platforms';
import type { CoverageEntry, IncentivesPayload } from '@shared/types';
import { fetchCoverage } from '../api';
import { safeExternalHref } from '../lib/links';
import { useI18n } from '../i18n';
import { Flag } from './Flag';
import { PlatformSelector } from './PlatformSelector';
import {
  AlertIcon,
  ArrowLeftIcon,
  GlobeIcon,
  InfoIcon,
  LayersIcon,
  MailIcon,
  PinIcon,
  UsersIcon,
} from './icons';

interface Props {
  data: IncentivesPayload | null;
  onBack: () => void;
}

/** Standalone registration page explaining how to become a data contributor. */
export function RegisterPage({ data, onBack }: Props) {
  const { t } = useI18n();
  const contactEmail = data?.contactEmail ?? null;
  const agentSetupUrl = safeExternalHref(data?.agentSetupUrl) ?? null;
  const discordUrl = safeExternalHref(data?.discordUrl) ?? null;
  const matrixUrl = safeExternalHref(data?.matrixUrl) ?? null;

  // Coverage is browsable for every platform here (not just ones that already have
  // agents), independent of the dashboard's selected platform.
  const platforms = PLATFORMS.map((p) => p.platform);
  const [picked, setPicked] = useState<BodyPlatform | null>(null);
  const activePlatform = picked ?? data?.platform ?? DEFAULT_PLATFORM;
  const [coverageRows, setCoverageRows] = useState<CoverageEntry[]>([]);
  useEffect(() => {
    if (!activePlatform) return;
    const ac = new AbortController();
    fetchCoverage(activePlatform, ac.signal)
      .then((c) => setCoverageRows(c.regions))
      .catch(() => setCoverageRows([]));
    return () => ac.abort();
  }, [activePlatform]);
  // Uncovered regions first, so the gaps are obvious; then by agent count, then name.
  const coverage = [...coverageRows].sort(
    (a, b) => a.agents - b.agents || a.displayName.localeCompare(b.displayName),
  );

  const buttonClass =
    'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-void-700/70 px-4 py-2.5 text-sm font-medium text-bone-200 transition hover:border-white/20 hover:text-bone-100';

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm text-bone-400 transition hover:text-bone-100"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t('registerBack')}
      </button>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blood-500/30 bg-blood-600/10 text-blood-300">
          <UsersIcon className="h-5 w-5" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-wide text-bone-100 sm:text-4xl">
          {t('registerTitle')}
        </h1>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone-300">{t('registerIntro')}</p>

      <section className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-4">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
        <p className="text-sm leading-relaxed text-bone-200">{t('registerFarNote')}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-void-800/50 p-5">
        <h2 className="font-display text-lg font-semibold tracking-wide text-bone-100">
          {t('registerWhyTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">{t('registerWhyBody')}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-void-800/50 p-5">
        <h2 className="font-display text-lg font-semibold tracking-wide text-bone-100">
          {t('registerHowTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">{t('registerHowBody')}</p>

        {agentSetupUrl && (
          <a
            href={agentSetupUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blood-300 underline-offset-2 hover:text-blood-200 hover:underline"
          >
            <LayersIcon className="h-4 w-4" />
            {t('registerSetupCta')}
          </a>
        )}

        <h3 className="mt-5 text-sm font-semibold text-bone-100">{t('registerNeedTitle')}</h3>
        <ul className="mt-3 space-y-2.5">
          <li className="flex items-start gap-3 text-sm text-bone-300">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-blood-300" />
            <span>{t('registerNeedRegion')}</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-bone-300">
            <LayersIcon className="mt-0.5 h-4 w-4 shrink-0 text-blood-300" />
            <span>{t('registerNeedPlatform')}</span>
          </li>
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-ember-500/30 bg-ember-500/[0.07] p-3">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-ember-400" />
          <div>
            <p className="text-sm font-semibold text-bone-100">{t('steamOnlyTitle')}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-bone-300">{t('steamOnlyBody')}</p>
          </div>
        </div>

        <p className="mt-5 text-xs text-bone-400">{t('registerSubmitEnglish')}</p>

        <div className="mt-3 flex flex-wrap gap-3">
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('Bloodpoint Incentives data agent request')}`}
              className={buttonClass}
            >
              <MailIcon className="h-4 w-4" />
              {t('registerContactCta', { email: contactEmail })}
            </a>
          ) : (
            <p className="text-sm text-bone-400">{t('registerNoContact')}</p>
          )}
          {discordUrl && (
            <a href={discordUrl} target="_blank" rel="noreferrer noopener" className={buttonClass}>
              <GlobeIcon className="h-4 w-4" />
              {t('communityDiscord')}
            </a>
          )}
          {matrixUrl && (
            <a href={matrixUrl} target="_blank" rel="noreferrer noopener" className={buttonClass}>
              <GlobeIcon className="h-4 w-4" />
              {t('communityMatrix')}
            </a>
          )}
        </div>
      </section>

      {activePlatform && (
        <section className="mt-5 rounded-2xl border border-white/10 bg-void-800/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-wide text-bone-100">
              {t('registerCoverageTitle')}
            </h2>
            {platforms.length > 1 && (
              <PlatformSelector platforms={platforms} current={activePlatform} onChange={setPicked} />
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-bone-300">{t('registerCoverageHint')}</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-400">{t('coverageSlugNote')}</p>
          <div className="scroll-thin mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-void-900/40 text-left text-xs uppercase tracking-wide text-bone-500">
                  <th className="whitespace-nowrap px-4 py-2 font-medium">{t('coverageRegionCol')}</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium">{t('coverageAgentsCol')}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.region} className="border-b border-white/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-bone-200">
                      <span className="flex items-center gap-2">
                        <Flag region={c.region} className="h-3.5 w-[21px]" />
                        <span>
                          {c.displayName}
                          <span className="ml-2 font-mono text-xs text-bone-500">{c.region}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.agents > 0 ? (
                        <span className="font-mono text-bone-200">{c.agents}</span>
                      ) : (
                        <span className="rounded-md bg-blood-600/15 px-2 py-0.5 text-xs font-medium text-blood-300">
                          {t('coverageNone')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
