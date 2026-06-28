import { resolveCadence } from '../common/cadence.js';
import type { Logger } from '../common/logger.js';
import type { BodyPlatform } from '../shared/platforms.js';
import type { AgentReport } from '../shared/types.js';
import { CadenceRejectedError } from './auth/errors.js';
import type { RegionRead } from './bhvr/client.js';
import type { HubClient } from './hubClient.js';
import { HubAuthError } from './hubClient.js';
import type { AgentStatus, PollSink } from './poll/sink.js';
import type { Schedule } from './schedule.js';

/**
 * The poller's sink for an agent: every real reading becomes an `AgentReport`
 * pushed to the hub. Fallback/failed reads carry no real data, so they are not
 * forwarded; the hub ages a region out on its own once reports stop.
 *
 * The hub returns the agent's current assignment in each report response, so this
 * also applies cadence/phase changes to the shared schedule on the fly, and
 * re-checks the agent's own cadence floor against the refreshTime it just observed
 * (refusing, fatally, if the hub asks for a cadence faster than the agent allows).
 */
export class HubReportingSink implements PollSink {
  private status: AgentStatus = 'initializing';
  private statusReason: string | null = null;
  private version: string | null = null;
  private category: string | null = null;
  private lastReportedAt: string | null = null;

  constructor(
    private readonly hub: HubClient,
    private readonly platform: BodyPlatform,
    private readonly schedule: Schedule,
    /** Agent's accepted cadence range (seconds or %refreshTime% expressions), or null. */
    private readonly floorExpr: string | null,
    private readonly ceilingExpr: string | null,
    private readonly log: Logger,
  ) {}

  async recordReal(read: RegionRead): Promise<void> {
    const report: AgentReport = {
      region: read.region,
      platform: this.platform,
      survivor: read.survivor,
      killer: read.killer,
      ratio: read.ratio,
      isReal: true,
      version: this.version,
      category: this.category,
      refreshTimeSeconds: read.refreshTime,
      measuredAt: new Date().toISOString(),
    };

    let assignment;
    try {
      assignment = await this.hub.report(report);
      this.lastReportedAt = report.measuredAt;
      // Debug-level: the hub logs the full reading at info, so this would just double it.
      this.log.debug({ region: read.region, ratio: read.ratio }, 'reported reading to hub');
    } catch (err) {
      // A bad key is fatal; anything else is transient and the next cycle retries.
      if (err instanceof HubAuthError) throw err;
      this.log.warn({ err, region: read.region }, 'failed to report reading to hub');
      return;
    }

    // Apply any cadence/phase change, then enforce our accepted range (may throw fatal).
    if (assignment) {
      this.schedule.apply(assignment);
      this.enforceRange(assignment.pollMinSeconds, assignment.pollMaxSeconds, read.refreshTime);
    }
  }

  /** Throw (fatally) if the hub's interval falls outside the agent's accepted range. */
  private enforceRange(
    pollMinSeconds: number,
    pollMaxSeconds: number,
    refreshTimeSeconds: number | null,
  ): void {
    if (this.floorExpr) {
      // Round to match how the hub rounds pollMin/pollMax, so an identical
      // expression on both sides compares equal and never false-trips.
      const floor = resolveCadence(this.floorExpr, refreshTimeSeconds);
      if (floor != null && pollMinSeconds < Math.round(floor)) {
        throw new CadenceRejectedError(
          `hub set a ${pollMinSeconds}s minimum, below this agent's floor of ${Math.round(floor)}s ` +
            `("${this.floorExpr}" at refreshTime=${refreshTimeSeconds}s). Refusing to continue.`,
        );
      }
    }
    if (this.ceilingExpr) {
      const ceiling = resolveCadence(this.ceilingExpr, refreshTimeSeconds);
      if (ceiling != null && pollMaxSeconds > Math.round(ceiling)) {
        throw new CadenceRejectedError(
          `hub set a ${pollMaxSeconds}s maximum, above this agent's ceiling of ${Math.round(ceiling)}s ` +
            `("${this.ceilingExpr}" at refreshTime=${refreshTimeSeconds}s). Refusing to continue.`,
        );
      }
    }
  }

  markStale(region: string): void {
    this.log.debug({ region }, 'reading was fallback/failed; not reported');
  }

  setStatus(status: AgentStatus, reason: string | null = null): void {
    this.status = status;
    this.statusReason = reason;
  }

  setVersionInfo(version: string | null, category: string | null): void {
    this.version = version;
    this.category = category;
  }

  markPassStarted(): void {
    /* single-region agent: nothing to track between pass boundaries */
  }

  markPassCompleted(): void {
    /* single-region agent: nothing to track between pass boundaries */
  }

  /** Snapshot for the health endpoint. */
  health(): { status: AgentStatus; reason: string | null; lastReportedAt: string | null } {
    return { status: this.status, reason: this.statusReason, lastReportedAt: this.lastReportedAt };
  }
}
