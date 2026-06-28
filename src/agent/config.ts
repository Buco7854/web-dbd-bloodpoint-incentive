import {
  type BodyPlatform,
  type DbdProvider,
  isKnownProvider,
  isSupportedProvider,
  platformForProvider,
  SUPPORTED_PROVIDERS,
} from '../shared/platforms.js';
import { DEFAULT_MAX_RATIO, resolveCadence } from '../common/cadence.js';
import { clamp, ConfigError, readInt, readString } from '../common/env.js';
import { CLIENT_OS } from './version/category.js';

/** Unset falls back to the default; `off`/`none` disables the bound. */
function resolvePollBound(env: NodeJS.ProcessEnv, name: string, fallback: string): string | null {
  const raw = readString(env, name);
  if (raw == null) return fallback;
  if (/^(off|none|disabled)$/i.test(raw)) return null;
  try {
    resolveCadence(raw, 300);
  } catch (err) {
    throw new ConfigError(`${name}: ${(err as Error).message}`);
  }
  return raw;
}

export { ConfigError };

/**
 * Agent configuration from the environment. The agent does NOT know its region
 * from env: the hub assigns it from the agent's key. Its platform follows from
 * the auth provider (it reports as the platform it authenticates with). Nothing
 * about the client is pinned: the version and client headers are always the
 * latest discovered ones, so there are no version/OS knobs to set.
 */
export interface AgentConfig {
  logLevel: string;
  tz: string;

  hubUrl: string;
  agentKey: string;
  /** Port for the agent's minimal health endpoint (0 disables it). */
  healthPort: number;

  authProvider: DbdProvider;
  /** Body platform this agent reports as, derived from the auth provider. */
  platform: BodyPlatform;
  /** Pre-obtained DBD session key (quick mode). */
  dbdApiKey: string | null;
  steam: {
    username: string | null;
    password: string | null;
    sharedSecret: string | null;
  };
  /** True when Steam credentials are present (enables full mode + depot discovery). */
  hasSteamCredentials: boolean;

  /** Always 'auto': the agent tracks the latest live build, never a pinned one. */
  gameVersion: 'auto';
  versionRefreshHours: number;
  clientOs: string;

  /**
   * Accepted cadence range; the agent refuses if the hub's interval is faster than
   * `pollFloor` (account risk) or slower than `pollCeiling`. Each is seconds or a
   * `%refreshTime%` expression evaluated against the observed refreshTime; null
   * disables that bound.
   */
  pollFloor: string | null;
  pollCeiling: string | null;

  /** Directory for the small last-working-version state file. */
  stateDir: string;

  bhvrHost: string;
  krakenProvider: 'steam' | 'egs';
}

/**
 * The fully-resolved config used to build the auth provider and BHVR client,
 * once the hub has told the agent which region to poll.
 */
export interface AppConfig extends AgentConfig {
  region: string;
}

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const authProviderRaw = (readString(env, 'AUTH_PROVIDER') ?? 'steam').toLowerCase();
  if (!isKnownProvider(authProviderRaw)) {
    throw new ConfigError(`AUTH_PROVIDER "${authProviderRaw}" is not a known provider`);
  }
  if (!isSupportedProvider(authProviderRaw)) {
    throw new ConfigError(
      `AUTH_PROVIDER "${authProviderRaw}" is not supported yet. ` +
        `Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`,
    );
  }
  const authProvider = authProviderRaw;
  const platform = platformForProvider(authProvider);

  const hubUrl = readString(env, 'HUB_URL');
  if (!hubUrl) {
    throw new ConfigError('HUB_URL is required (the hub this agent reports to).');
  }
  const agentKey = readString(env, 'AGENT_KEY');
  if (!agentKey) {
    throw new ConfigError('AGENT_KEY is required (the hub identifies the agent by this key).');
  }

  const dbdApiKey = readString(env, 'DBD_API_KEY');
  const steamUsername = readString(env, 'STEAM_USERNAME');
  const steamPassword = readString(env, 'STEAM_PASSWORD');
  const steamSharedSecret = readString(env, 'STEAM_SHARED_SECRET');
  const hasSteamCredentials = Boolean(steamUsername && steamPassword);

  const bhvrHost = authProvider === 'epic' ? 'egs.live.bhvrdbd.com' : 'steam.live.bhvrdbd.com';
  const krakenProvider = authProvider === 'epic' ? 'egs' : 'steam';

  // The agent always discovers the latest build, which needs Steam credentials.
  const canDiscoverVersion = authProvider === 'steam' && hasSteamCredentials;
  if (!canDiscoverVersion) {
    throw new ConfigError(
      'Steam credentials are required: the agent always tracks the latest live ' +
        'build via depot discovery. Set STEAM_USERNAME + STEAM_PASSWORD ' +
        '(+ STEAM_SHARED_SECRET). DBD_API_KEY may be set in addition for BHVR auth.',
    );
  }

  return {
    logLevel: (readString(env, 'LOG_LEVEL') ?? 'info').toLowerCase(),
    tz: readString(env, 'TZ') ?? 'UTC',

    hubUrl: hubUrl.replace(/\/+$/, ''),
    agentKey,
    healthPort: clamp(readInt(env, 'AGENT_HEALTH_PORT', 3001), 0, 65535),

    authProvider,
    platform,
    dbdApiKey,
    steam: { username: steamUsername, password: steamPassword, sharedSecret: steamSharedSecret },
    hasSteamCredentials,

    gameVersion: 'auto',
    versionRefreshHours: clamp(readInt(env, 'VERSION_REFRESH_HOURS', 6), 1),
    clientOs: CLIENT_OS,

    pollFloor: resolvePollBound(env, 'AGENT_MIN_POLL_SECONDS', '%refreshTime%'),
    // Ceiling mirrors the hub's default max so the agent accepts its normal cadence.
    pollCeiling: resolvePollBound(env, 'AGENT_MAX_POLL_SECONDS', `%refreshTime% * ${DEFAULT_MAX_RATIO}`),

    stateDir: readString(env, 'STATE_DIR') ?? './data',

    bhvrHost,
    krakenProvider,
  };
}
