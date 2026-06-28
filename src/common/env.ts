/** Shared environment-parsing helpers for the agent and hub configs. */

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Strip one pair of matching surrounding quotes (a common env-file gotcha). */
function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

export function readString(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw == null) return null;
  const value = unquote(raw.trim());
  return value.length > 0 ? value : null;
}

export function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  return readIntOpt(env, name) ?? fallback;
}

/** Like readInt but returns null when unset, so callers can fall back to another source. */
export function readIntOpt(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = readString(env, name);
  if (raw == null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be an integer, got "${raw}"`);
  }
  return value;
}

export function clamp(value: number, min: number, max = Number.POSITIVE_INFINITY): number {
  return Math.min(Math.max(value, min), max);
}

/** Reads a boolean flag (1/true/yes/on => true), falling back when unset. */
export function readBool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = readString(env, name);
  if (raw == null) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}
