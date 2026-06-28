import { delay } from '../../common/async.js';

/**
 * Hard floor on spacing between any two BHVR calls, so nothing - including a 401
 * re-auth retry - ever bursts faster than minSpacingMs.
 */
export class RateGate {
  private lastCallAt = 0;

  constructor(private readonly minSpacingMs: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const waitMs = this.lastCallAt + this.minSpacingMs - now;
    if (waitMs > 0) await delay(waitMs, signal);
    this.lastCallAt = Date.now();
  }
}
