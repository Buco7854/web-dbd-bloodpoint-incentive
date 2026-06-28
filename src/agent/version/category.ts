/**
 * Derives the incentive `category` and `User-Agent` from a DBD client version
 * string, e.g. "DBD_Sushi_REL_Steam_Shipping_9_3420587":
 *   category:  sushi-rel-3420587-live  (parts[1]-parts[2]-last, lowercased)
 *   UserAgent: DeadByDaylight/<version> (http-eventloop) Windows/<os>
 */
export interface VersionArtifacts {
  /** Full version string, e.g. "DBD_Sushi_REL_Steam_Shipping_9_3420587". */
  version: string;
  /** Derived category, e.g. "sushi-rel-3420587-live". */
  category: string;
  userAgent: string;
  /** Trailing build number used to compare which build is newer. */
  buildId: number;
}

export class VersionFormatError extends Error {
  override name = 'VersionFormatError';
}

/**
 * Fixed client OS fingerprint for the User-Agent and x-kraken-client-os header.
 * Identifies the emulated client machine, not a game version, so it is a constant.
 */
export const CLIENT_OS = '10.0.26100.1.768.64bit';

export function deriveCategory(versionString: string): string {
  const parts = versionString.split('_');
  const product = parts[1];
  const release = parts[2];
  const build = parts[parts.length - 1];
  if (!product || !release || !build || parts.length < 4) {
    throw new VersionFormatError(
      `Cannot derive category from version string "${versionString}". ` +
        'Expected something like DBD_Sushi_REL_Steam_Shipping_9_3420587.',
    );
  }
  return `${product.toLowerCase()}-${release.toLowerCase()}-${build}-live`;
}

export function buildUserAgent(versionString: string, clientOs: string): string {
  return `DeadByDaylight/${versionString} (http-eventloop) Windows/${clientOs}`;
}

export function parseBuildId(versionString: string): number {
  const parts = versionString.split('_');
  const build = parts[parts.length - 1];
  const id = build ? Number.parseInt(build, 10) : Number.NaN;
  return Number.isFinite(id) ? id : 0;
}

export function deriveVersionArtifacts(
  versionString: string,
  clientOs: string,
): VersionArtifacts {
  return {
    version: versionString,
    category: deriveCategory(versionString),
    userAgent: buildUserAgent(versionString, clientOs),
    buildId: parseBuildId(versionString),
  };
}
