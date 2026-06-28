import { HubAuthError } from '../hubClient.js';

export class AuthError extends Error {
  override name = 'AuthError';
}

/** An auth/config error that cannot be recovered by retrying (bad credentials,
 *  a rejected non-refreshable key, etc.). The process should stop on these. */
export class FatalAuthError extends AuthError {
  override name = 'FatalAuthError';
}

export class NotImplementedError extends Error {
  override name = 'NotImplementedError';
}

/** The hub asked the agent to poll faster than its own safety floor. Not retryable. */
export class CadenceRejectedError extends Error {
  override name = 'CadenceRejectedError';
}

/** True when the error means the deployment cannot work as configured. */
export function isFatalError(err: unknown): boolean {
  return (
    err instanceof FatalAuthError ||
    err instanceof NotImplementedError ||
    err instanceof CadenceRejectedError ||
    // A rejected hub key never recovers by retrying; fatal in steady state too,
    // not just at startup (poller.handleError routes through here).
    err instanceof HubAuthError
  );
}
