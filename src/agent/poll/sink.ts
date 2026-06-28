import type { RegionRead } from '../bhvr/client.js';

/** Agent-local poll status; `paused` means a deliberate backoff. */
export type AgentStatus = 'initializing' | 'ok' | 'degraded' | 'paused' | 'error';

/** Where the poller sends what it observes; the agent forwards real readings to the hub. */
export interface PollSink {
  /** A real reading (ratio !== 0). The only thing forwarded to the hub. */
  recordReal(read: RegionRead): void | Promise<void>;
  /** The latest attempt did not return real data (fallback or failure). */
  markStale(region: string): void;
  setStatus(status: AgentStatus, reason?: string | null): void;
  setVersionInfo(version: string | null, category: string | null): void;
  markPassStarted(): void;
  markPassCompleted(): void;
}
