import { isKnownRegion } from '../shared/regions.js';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export type AuthProviderName = 'steam' | 'epic';
export type BodyPlatform = 'Windows' | 'EGS' | 'GRDK';

export interface AppConfig {
  port: number;
  logLevel: string;
  tz: string;

  /** Site-access gate (Authentik second layer). */
  accessApiKey: string | null;
  accessApiKeyHeader: string; // lowercased for lookup

  authProvider: AuthProviderName;
  /** Pre-obtained DBD session key (quick mode). */
  dbdApiKey: string | null;
  steam: {
    username: string | null;
    password: string | null;
    sharedSecret: string | null;
  };
  /** True when Steam credentials are present (enables full mode + depot discovery). */
  hasSteamCredentials: boolean;

  /** Body `platform`. */
  platform: BodyPlatform;
  /** Override/seed for category + UA, or 'auto'. */
  gameVersion: string;
  versionRefreshHours: number;
  clientVersion: string; // x-kraken-client-version
  clientOs: string; // x-kraken-client-os + UA OS segment

  forceRegion: string | null;
  pollIntervalSeconds: number;
  requestMinSpacingMs: number;
  uiRefreshSeconds: number;
  pageSize: number;

  /** Directory for small persisted state (last-working category). */
  stateDir: string;

  // ---- derived ----
  /** BHVR API host for the selected provider. */
  bhvrHost: string;
  /** x-kraken-client-platform / x-kraken-client-provider (auth provider). */
  krakenProvider: 'steam' | 'egs';
}

/** Strip one pair of matching surrounding quotes (a common env-file gotcha). */
function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

/** Reads a config value, trimmed and with surrounding quotes stripped. */
function readString(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw == null) return null;
  const value = unquote(raw.trim());
  return value.length > 0 ? value : null;
}

function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = readString(env, name);
  if (raw == null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be an integer, got "${raw}"`);
  }
  return value;
}

function clamp(value: number, min: number, max = Number.POSITIVE_INFINITY): number {
  return Math.min(Math.max(value, min), max);
}

const BODY_PLATFORMS: BodyPlatform[] = ['Windows', 'EGS', 'GRDK'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const authProviderRaw = (readString(env, 'AUTH_PROVIDER') ?? 'steam').toLowerCase();
  if (authProviderRaw !== 'steam' && authProviderRaw !== 'epic') {
    throw new ConfigError(`AUTH_PROVIDER must be "steam" or "epic", got "${authProviderRaw}"`);
  }
  const authProvider = authProviderRaw as AuthProviderName;

  const platformRaw = (readString(env, 'DBD_PLATFORM') ?? 'Windows') as BodyPlatform;
  if (!BODY_PLATFORMS.includes(platformRaw)) {
    throw new ConfigError(
      `DBD_PLATFORM must be one of ${BODY_PLATFORMS.join(', ')}, got "${platformRaw}"`,
    );
  }

  const forceRegion = readString(env, 'FORCE_REGION');
  if (forceRegion && !isKnownRegion(forceRegion)) {
    throw new ConfigError(`FORCE_REGION "${forceRegion}" is not a known region id`);
  }

  const dbdApiKey = readString(env, 'DBD_API_KEY');
  const steamUsername = readString(env, 'STEAM_USERNAME');
  const steamPassword = readString(env, 'STEAM_PASSWORD');
  const steamSharedSecret = readString(env, 'STEAM_SHARED_SECRET');
  const hasSteamCredentials = Boolean(steamUsername && steamPassword);

  const gameVersion = readString(env, 'DBD_GAME_VERSION') ?? 'auto';

  // Version resolution needs EITHER an explicit version OR Steam depot discovery.
  // A present DBD_API_KEY means quick mode, which has no depot discovery.
  const canDiscoverVersion = authProvider === 'steam' && hasSteamCredentials && !dbdApiKey;
  if (gameVersion === 'auto' && !canDiscoverVersion) {
    throw new ConfigError(
      'DBD_GAME_VERSION is required when Steam depot discovery is unavailable ' +
        '(quick mode with only DBD_API_KEY, or no Steam credentials). ' +
        'Set DBD_GAME_VERSION to a full client version string, ' +
        'e.g. DBD_Sushi_REL_Steam_Shipping_9_3420587.',
    );
  }

  // Need a way to authenticate: either a pre-obtained key or Steam login.
  if (authProvider === 'steam' && !dbdApiKey && !hasSteamCredentials) {
    throw new ConfigError(
      'No DBD credentials configured. Provide DBD_API_KEY (quick mode) ' +
        'or STEAM_USERNAME + STEAM_PASSWORD (+ STEAM_SHARED_SECRET) for full mode.',
    );
  }

  const pollIntervalSeconds = clamp(readInt(env, 'POLL_INTERVAL_SECONDS', 600), 300);
  const requestMinSpacingMs = clamp(readInt(env, 'REQUEST_MIN_SPACING_MS', 3000), 1000);
  const uiRefreshSeconds = clamp(readInt(env, 'UI_REFRESH_SECONDS', 60), 5);
  const pageSize = clamp(readInt(env, 'PAGE_SIZE', 12), 1);
  const versionRefreshHours = clamp(readInt(env, 'VERSION_REFRESH_HOURS', 6), 1);

  const bhvrHost = authProvider === 'epic' ? 'egs.live.bhvrdbd.com' : 'steam.live.bhvrdbd.com';
  const krakenProvider = authProvider === 'epic' ? 'egs' : 'steam';

  return {
    port: clamp(readInt(env, 'PORT', 3000), 1, 65535),
    logLevel: (readString(env, 'LOG_LEVEL') ?? 'info').toLowerCase(),
    tz: readString(env, 'TZ') ?? 'UTC',

    accessApiKey: readString(env, 'ACCESS_API_KEY'),
    accessApiKeyHeader: (readString(env, 'ACCESS_API_KEY_HEADER') ?? 'X-API-Key').toLowerCase(),

    authProvider,
    dbdApiKey,
    steam: {
      username: steamUsername,
      password: steamPassword,
      sharedSecret: steamSharedSecret,
    },
    hasSteamCredentials,

    platform: platformRaw,
    gameVersion,
    versionRefreshHours,
    clientVersion: readString(env, 'DBD_CLIENT_VERSION') ?? '10.0.0',
    clientOs: readString(env, 'DBD_CLIENT_OS') ?? '10.0.26100.1.768.64bit',

    forceRegion,
    pollIntervalSeconds,
    requestMinSpacingMs,
    uiRefreshSeconds,
    pageSize,

    stateDir: readString(env, 'STATE_DIR') ?? './data',

    bhvrHost,
    krakenProvider,
  };
}
