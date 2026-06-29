/** Canonical project links (single source of truth). */
export const REPO_URL = 'https://github.com/Buco7854/bloodpoint-incentives';

/** The Acknowledgments section of the repo README. */
export const ACKNOWLEDGMENTS_URL = `${REPO_URL}#acknowledgments`;

/**
 * safeExternalHref returns the URL only if it is a plain http(s) link, else
 * undefined. Operator-configured links (Discord, Matrix, agent-setup) flow into
 * `href` attributes; gating the scheme here ensures a misconfigured value can never
 * become a `javascript:`/`data:` URL that executes on click.
 */
export function safeExternalHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const proto = new URL(url, window.location.origin).protocol;
    return proto === 'http:' || proto === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
