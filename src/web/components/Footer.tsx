import type { IncentivesPayload } from '@shared/types';
import { useI18n } from '../i18n';
import { ACKNOWLEDGMENTS_URL, safeExternalHref } from '../lib/links';

interface Props {
  data: IncentivesPayload | null;
}

export function Footer({ data }: Props) {
  const { t } = useI18n();
  const discordHref = safeExternalHref(data?.discordUrl);
  const matrixHref = safeExternalHref(data?.matrixUrl);
  return (
    <footer className="mt-12 border-t border-white/5 px-4 pt-6 pb-10 text-center text-xs text-bone-600 sm:px-6">
      <p className="disclaimer mx-auto max-w-2xl">{t('footerDisclaimer')}</p>
      <p className="mt-2 text-bone-500">
        <a
          href={ACKNOWLEDGMENTS_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-2 hover:text-bone-300 hover:underline"
        >
          {t('footerThanks')}
        </a>
      </p>
      {(data?.contactEmail || discordHref || matrixHref) && (
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-bone-500">
          {data?.contactEmail && (
            <a
              href={`mailto:${data.contactEmail}`}
              className="underline-offset-2 hover:text-bone-300 hover:underline"
            >
              {t('footerContact', { email: data.contactEmail })}
            </a>
          )}
          {discordHref && (
            <a
              href={discordHref}
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-2 hover:text-bone-300 hover:underline"
            >
              {t('communityDiscord')}
            </a>
          )}
          {matrixHref && (
            <a
              href={matrixHref}
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-2 hover:text-bone-300 hover:underline"
            >
              {t('communityMatrix')}
            </a>
          )}
        </p>
      )}
      {data && (
        <p className="mt-2 font-mono text-[11px] text-bone-700">
          {data.platform} · {data.category ?? 'version pending'}
        </p>
      )}
    </footer>
  );
}
