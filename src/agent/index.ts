import { resolveCadence } from '../common/cadence.js';
import { delay } from '../common/async.js';
import { createLogger } from '../common/logger.js';
import type { AgentAssignment } from '../shared/types.js';
import { isFatalError } from './auth/errors.js';
import { createAuth } from './auth/factory.js';
import { BhvrClient } from './bhvr/client.js';
import { RateGate } from './bhvr/rateGate.js';
import { type AppConfig, ConfigError, loadAgentConfig } from './config.js';
import { startHealthServer } from './health.js';
import { HubAuthError, HubClient } from './hubClient.js';
import { Poller } from './poll/poller.js';
import { HubReportingSink } from './reporter.js';
import { Schedule } from './schedule.js';
import { VersionFormatError } from './version/category.js';
import { StateStore } from './version/store.js';

const MAX_ASSIGNMENT_BACKOFF_MS = 60_000;
/** Hard floor between any two BHVR calls (401 re-auth, anchor fetch, the request). */
const MIN_BHVR_SPACING_MS = 3_000;

/** Polls the hub for this agent's assignment, backing off until it succeeds. */
async function awaitAssignment(hub: HubClient, log: ReturnType<typeof createLogger>): Promise<AgentAssignment> {
  let backoff = 2_000;
  for (;;) {
    try {
      return await hub.fetchAssignment();
    } catch (err) {
      if (err instanceof HubAuthError) throw err; // bad key: not worth retrying
      log.warn({ err, retryInMs: backoff }, 'could not fetch assignment from hub; retrying');
      await delay(backoff);
      backoff = Math.min(backoff * 2, MAX_ASSIGNMENT_BACKOFF_MS);
    }
  }
}

async function main(): Promise<void> {
  const config = loadAgentConfig();
  process.env.TZ = config.tz;

  const log = createLogger(config.logLevel);
  log.info({ hubUrl: config.hubUrl, provider: config.authProvider }, 'starting bloodpoint agent');

  const hub = new HubClient({ baseUrl: config.hubUrl, agentKey: config.agentKey });
  const assignment = await awaitAssignment(hub, log);
  log.info(
    {
      region: assignment.region,
      platform: assignment.platform,
      pollMinSeconds: assignment.pollMinSeconds,
      pollMaxSeconds: assignment.pollMaxSeconds,
      phaseOffsetSeconds: assignment.phaseOffsetSeconds,
    },
    'received assignment from hub',
  );

  // Platform is tied to auth: the agent reports as the platform it authenticates
  // with. The hub-assigned platform must agree, or the registry and the agent's
  // credentials disagree about what this agent is.
  if (assignment.platform !== config.platform) {
    throw new ConfigError(
      `Hub assigned platform "${assignment.platform}" but this agent authenticates ` +
        `as "${config.authProvider}" (platform "${config.platform}"). ` +
        "Align the agent's region/provider in the hub with its credentials.",
    );
  }

  // Safety: refuse to start if a static (non-refreshTime) bound is already violated.
  // A refreshTime-based bound can only be checked once polling observes it, which
  // the reporter does on each report response.
  if (config.pollFloor) {
    const floor = resolveCadence(config.pollFloor, null);
    if (floor != null && assignment.pollMinSeconds < floor) {
      throw new ConfigError(
        `Hub set a ${assignment.pollMinSeconds}s minimum, below this agent's floor of ` +
          `${Math.round(floor)}s (AGENT_MIN_POLL_SECONDS="${config.pollFloor}"). Refusing to start.`,
      );
    }
  }
  if (config.pollCeiling) {
    const ceiling = resolveCadence(config.pollCeiling, null);
    if (ceiling != null && assignment.pollMaxSeconds > ceiling) {
      throw new ConfigError(
        `Hub set a ${assignment.pollMaxSeconds}s maximum, above this agent's ceiling of ` +
          `${Math.round(ceiling)}s (AGENT_MAX_POLL_SECONDS="${config.pollCeiling}"). Refusing to start.`,
      );
    }
  }

  const runtime: AppConfig = { ...config, region: assignment.region };
  const schedule = new Schedule(assignment);

  const store = new StateStore(runtime.stateDir, log.child({ component: 'store' }));
  const { provider, resolver, anchorResolver, dispose } = createAuth(runtime, store, log);

  const sink = new HubReportingSink(
    hub,
    runtime.platform,
    schedule,
    config.pollFloor,
    config.pollCeiling,
    log.child({ component: 'reporter' }),
  );

  let canPoll = true;
  try {
    await resolver.init();
  } catch (err) {
    if (err instanceof VersionFormatError || isFatalError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      log.fatal({ err }, 'unrecoverable startup error; halting polling and reporting unhealthy');
      sink.setStatus('error', message);
      await dispose();
      canPoll = false;
    } else {
      log.error({ err }, 'version resolution failed at startup; poller will keep retrying');
    }
  }

  const rateGate = new RateGate(MIN_BHVR_SPACING_MS);
  const client = new BhvrClient(
    {
      host: runtime.bhvrHost,
      krakenProvider: runtime.krakenProvider,
      clientOs: runtime.clientOs,
      platform: runtime.platform,
    },
    provider,
    anchorResolver,
    rateGate,
    log.child({ component: 'bhvr' }),
  );

  let shuttingDown = false;
  let pollerRef: Poller | undefined;
  let healthServerRef: import('node:http').Server | undefined;
  const shutdown = async (reason: string, code = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ reason, code }, 'shutting down');
    try {
      await pollerRef?.stop();
      healthServerRef?.close();
      await dispose();
    } catch (err) {
      log.error({ err }, 'error during shutdown');
    }
    process.exit(code);
  };

  const poller = new Poller(
    sink,
    client,
    resolver,
    {
      region: runtime.region,
      // Wall-clock aligned wait from the hub-driven schedule (phase + jitter).
      nextBaseWaitMs: () => schedule.nextWaitMs(Date.now()),
      // The hub tags one lead agent per platform to probe immediately (seed
      // refreshTime); everyone else waits for their slot to avoid a startup herd.
      probeImmediately: assignment.probeImmediately,
      versionRefreshMs: runtime.versionRefreshHours * 3_600_000,
      // On an unrecoverable error, stop hitting Steam/BHVR and log off, but keep
      // the process alive so the health endpoint reports unhealthy rather than
      // restart-looping into Steam, which risks the account.
      onFatal: () => void dispose(),
    },
    log.child({ component: 'poller' }),
  );
  pollerRef = poller;

  if (runtime.healthPort > 0) healthServerRef = startHealthServer(runtime.healthPort, sink, log.child({ component: 'health' }));
  if (canPoll) poller.start();

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}`);
  } else if (err instanceof HubAuthError) {
    console.error(`Hub rejected the agent key: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
