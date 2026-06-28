import type { AgentAssignment, AgentReport } from '../shared/types.js';
import { isKnownPlatform } from '../shared/platforms.js';
import { isKnownRegion } from '../shared/regions.js';

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function parseAssignment(raw: unknown): AgentAssignment {
  const data = (raw ?? {}) as Partial<AgentAssignment>;
  if (!data.region || !isKnownRegion(data.region)) {
    throw new HubError(`hub returned an invalid region "${data.region}"`);
  }
  if (!data.platform || !isKnownPlatform(data.platform)) {
    throw new HubError(`hub returned an invalid platform "${data.platform}"`);
  }
  const pollMinSeconds = positiveInt(data.pollMinSeconds, 300);
  const pollMaxSeconds = Math.max(positiveInt(data.pollMaxSeconds, pollMinSeconds), pollMinSeconds);
  const phaseOffsetSeconds = Math.max(
    0,
    Number.isFinite(data.phaseOffsetSeconds) ? (data.phaseOffsetSeconds as number) : 0,
  );
  return {
    region: data.region,
    platform: data.platform,
    pollMinSeconds,
    pollMaxSeconds,
    phaseOffsetSeconds,
    probeImmediately: data.probeImmediately === true,
  };
}

export class HubError extends Error {
  override name = 'HubError';
}

/** Thrown when the hub rejects the agent key; not recoverable by retrying. */
export class HubAuthError extends HubError {
  override name = 'HubAuthError';
}

export interface HubClientOptions {
  baseUrl: string;
  agentKey: string;
  requestTimeoutMs?: number;
}

/** Talks to the hub: fetches this agent's assignment and pushes readings. */
export class HubClient {
  private readonly timeoutMs: number;

  constructor(private readonly options: HubClientOptions) {
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async fetchAssignment(signal?: AbortSignal): Promise<AgentAssignment> {
    const res = await this.send('GET', '/api/v1/agent/assignment', undefined, signal);
    return parseAssignment(await res.json());
  }

  /** Report a reading; the hub returns the agent's current assignment in reply. */
  async report(report: AgentReport, signal?: AbortSignal): Promise<AgentAssignment | null> {
    const res = await this.send('POST', '/api/v1/agent/readings', report, signal);
    const body = (await res.json().catch(() => null)) as { assignment?: unknown } | null;
    if (!body?.assignment) return null;
    try {
      return parseAssignment(body.assignment);
    } catch {
      return null; // a malformed assignment in a report reply isn't worth aborting on
    }
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onParentAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    let res: Response;
    try {
      res = await fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.options.agentKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new HubError(`network error calling hub ${path}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }

    if (res.status === 401 || res.status === 403) {
      throw new HubAuthError(`hub rejected the agent key (${res.status}) on ${path}`);
    }
    if (!res.ok) {
      throw new HubError(`hub responded ${res.status} on ${path}`);
    }
    return res;
  }
}
