/**
 * The platforms DBD matchmaking is segmented by. Incentives are per-platform, so
 * the hub aggregates and the UI lets a visitor switch between them.
 */
export type BodyPlatform = 'Windows' | 'EGS' | 'GRDK';

export interface PlatformMeta {
  platform: BodyPlatform;
  /** Human label shown in the UI. */
  label: string;
}

export const PLATFORMS: readonly PlatformMeta[] = [
  { platform: 'Windows', label: 'Steam' },
  { platform: 'EGS', label: 'Epic' },
  { platform: 'GRDK', label: 'Microsoft Store' },
];

/** The platform the UI requests by default (Steam) until the visitor picks another. */
export const DEFAULT_PLATFORM: BodyPlatform = 'Windows';

const PLATFORM_INDEX = new Map<string, PlatformMeta>(PLATFORMS.map((p) => [p.platform, p]));

export function isKnownPlatform(platform: string): platform is BodyPlatform {
  return PLATFORM_INDEX.has(platform);
}

export function getPlatformMeta(platform: string): PlatformMeta | undefined {
  return PLATFORM_INDEX.get(platform);
}

/**
 * The DBD auth provider an agent uses. The platform is a consequence of it (you
 * authenticate as a Steam/Epic/Microsoft client and report that platform), so the
 * two are never configured independently. Only Steam is implemented so far.
 */
export type DbdProvider = 'steam' | 'epic' | 'grdk';

export const PROVIDER_PLATFORM: Record<DbdProvider, BodyPlatform> = {
  steam: 'Windows',
  epic: 'EGS',
  grdk: 'GRDK',
};

/** Providers with a working auth + version-discovery implementation today. */
export const SUPPORTED_PROVIDERS: readonly DbdProvider[] = ['steam'];

export function isKnownProvider(provider: string): provider is DbdProvider {
  return provider in PROVIDER_PLATFORM;
}

export function isSupportedProvider(provider: string): provider is DbdProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

export function platformForProvider(provider: DbdProvider): BodyPlatform {
  return PROVIDER_PLATFORM[provider];
}
