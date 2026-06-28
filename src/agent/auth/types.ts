/**
 * Pluggable DBD authentication. The rest of the app depends only on this
 * interface, so adding a new provider (e.g. Epic) stays an isolated change.
 */
export interface AuthProvider {
  /** For logging only (apiKey | steam | epic). */
  readonly name: string;

  /** Return a usable DBD api-key, authenticating/reusing the session as needed. */
  getApiKey(): Promise<string>;

  /** Force a brand-new key. Called after a 401 from matchIncentives. */
  refresh(): Promise<string>;

  /**
   * Present only when this provider can discover the latest live client version
   * (Steam depot). Null for quick mode / Epic stub, where DBD_GAME_VERSION is used.
   */
  readonly versionDiscovery: VersionDiscovery | null;

  /** Release resources (Steam connection, timers) on shutdown. */
  shutdown(): Promise<void>;
}

/** Resolves the newest public-branch client version string. */
export interface VersionDiscovery {
  resolveLatestVersion(): Promise<string>;
}
