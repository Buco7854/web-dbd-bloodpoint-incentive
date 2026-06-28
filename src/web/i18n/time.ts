import type { TFunc } from './index';

/** Localized "x ago" string from an ISO timestamp relative to `now`. */
export function formatRelativeTime(iso: string | null, now: number, t: TFunc): string {
  if (!iso) return t('timeNever');
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return t('timeUnknown');
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 5) return t('timeJustNow');
  if (seconds < 60) return t('timeSecondsAgo', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('timeMinutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeHoursAgo', { n: hours });
  return t('timeDaysAgo', { n: Math.floor(hours / 24) });
}

/** "Updated x ago", combining the relative time with the localized wrapper; the
 *  label opens a sentence, so capitalize its first letter across locales. */
export function formatUpdated(iso: string | null, now: number, t: TFunc): string {
  const s = t('updatedAgo', { time: formatRelativeTime(iso, now, t) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
