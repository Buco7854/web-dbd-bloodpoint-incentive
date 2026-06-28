import { type AppConfig, ConfigError } from '../config.js';
import type { Logger } from '../../common/logger.js';
import { AnchorResolver } from '../bhvr/anchor.js';
import { VersionResolver } from '../version/resolver.js';
import type { StateStore } from '../version/store.js';
import { ApiKeyProvider } from './apiKeyProvider.js';
import { EpicAuthProvider } from './epicProvider.js';
import { SteamAuthProvider } from './steamProvider.js';
import { SteamClient } from './steam/steamClient.js';
import { SteamVersionDiscovery } from './steam/versionDiscovery.js';
import type { AuthProvider } from './types.js';

export interface AuthBundle {
  provider: AuthProvider;
  resolver: VersionResolver;
  /** Resolves the live client version (and login anchor) from BHVR. */
  anchorResolver: AnchorResolver;
  /** Releases auth resources (Steam connection, timers). */
  dispose: () => Promise<void>;
}

/** Wires the auth provider, version resolver, and anchor resolver for the mode. */
export function createAuth(config: AppConfig, store: StateStore, log: Logger): AuthBundle {
  const versionLog = log.child({ component: 'version' });
  const anchorResolver = new AnchorResolver(
    {
      host: config.bhvrHost,
      krakenProvider: config.krakenProvider,
      clientOs: config.clientOs,
      log: log.child({ component: 'anchor' }),
    },
    config.versionRefreshHours * 3_600_000,
  );

  // Create a Steam client whenever credentials are present, even in quick mode,
  // so the latest version can be discovered from the depot.
  let steamClient: SteamClient | null = null;
  let discovery: SteamVersionDiscovery | null = null;
  if (config.authProvider === 'steam' && config.hasSteamCredentials) {
    const { username, password, sharedSecret } = config.steam;
    if (username && password) {
      steamClient = new SteamClient({ username, password, sharedSecret }, log.child({ component: 'steam' }));
      discovery = new SteamVersionDiscovery(steamClient, versionLog);
    }
  }

  const resolver = new VersionResolver({
    gameVersion: config.gameVersion,
    clientOs: config.clientOs,
    discovery,
    store,
    log: versionLog,
  });

  // Quick mode: a pre-obtained key handles BHVR auth; Steam, if present, only
  // does version discovery.
  if (config.dbdApiKey) {
    return {
      provider: new ApiKeyProvider(config.dbdApiKey),
      resolver,
      anchorResolver,
      dispose: async () => {
        await steamClient?.shutdown();
      },
    };
  }

  if (config.authProvider === 'epic') {
    return { provider: new EpicAuthProvider(), resolver, anchorResolver, dispose: async () => {} };
  }

  if (!steamClient || !discovery) {
    throw new ConfigError('Steam mode requires STEAM_USERNAME and STEAM_PASSWORD');
  }
  const provider = new SteamAuthProvider({
    steamClient,
    discovery,
    anchorResolver,
    config,
    log: log.child({ component: 'auth' }),
  });
  return { provider, resolver, anchorResolver, dispose: () => provider.shutdown() };
}
