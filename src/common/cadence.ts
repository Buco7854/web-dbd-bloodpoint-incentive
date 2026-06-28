/**
 * Resolves a poll-cadence value that may be a plain number of seconds or a small
 * expression referencing the live DBD refresh cadence via `%refreshTime%` (or its
 * alias `%auto%`), e.g. "%refreshTime%", "%refreshTime% * 1.2", "%auto% + 30".
 *
 * The expression grammar is intentionally tiny: numbers, the placeholders, and
 * `+ - * / ( )`. It is parsed by a recursive-descent evaluator, never `eval`, so
 * a config value can't run arbitrary code.
 */

export class CadenceError extends Error {
  override name = 'CadenceError';
}

/**
 * Default ratio of max:min for the poll interval when no explicit max is set.
 * Shared so the hub's default cadence and the agent's default accepted ceiling
 * stay in lockstep (both run `min` .. `min * DEFAULT_MAX_RATIO`).
 */
export const DEFAULT_MAX_RATIO = 1.33;

const PLACEHOLDER = /%(refreshTime|auto)%/gi;
// Separate, non-global copy: a global regex's lastIndex makes .test() stateful.
const PLACEHOLDER_TEST = /%(refreshTime|auto)%/i;

/** True if the expression needs the live refreshTime to resolve. */
export function needsRefreshTime(value: string | number): boolean {
  return typeof value === 'string' && PLACEHOLDER_TEST.test(value);
}

/**
 * Resolve to a number of seconds, or null when the expression references
 * refreshTime but none is known yet (the caller falls back to a bootstrap value).
 */
export function resolveCadence(
  value: string | number,
  refreshTimeSeconds: number | null,
): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CadenceError(`cadence ${value} is not finite`);
    return value;
  }
  const trimmed = value.trim();
  if (trimmed === '') throw new CadenceError('cadence expression is empty');

  if (needsRefreshTime(trimmed) && refreshTimeSeconds == null) return null;
  const substituted = trimmed.replace(PLACEHOLDER, () => String(refreshTimeSeconds));

  const result = new Evaluator(substituted).evaluate();
  if (!Number.isFinite(result)) {
    throw new CadenceError(`cadence expression "${value}" did not resolve to a finite number`);
  }
  return result;
}

/** Recursive-descent evaluator for + - * / and parentheses over numbers. */
class Evaluator {
  private pos = 0;

  constructor(private readonly src: string) {}

  evaluate(): number {
    const value = this.expr();
    this.skipSpace();
    if (this.pos < this.src.length) {
      throw new CadenceError(`unexpected "${this.src[this.pos]}" in cadence expression`);
    }
    return value;
  }

  private expr(): number {
    let value = this.term();
    for (;;) {
      this.skipSpace();
      const op = this.src[this.pos];
      if (op === '+' || op === '-') {
        this.pos += 1;
        const rhs = this.term();
        value = op === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private term(): number {
    let value = this.factor();
    for (;;) {
      this.skipSpace();
      const op = this.src[this.pos];
      if (op === '*' || op === '/') {
        this.pos += 1;
        const rhs = this.factor();
        if (op === '/' && rhs === 0) throw new CadenceError('division by zero in cadence expression');
        value = op === '*' ? value * rhs : value / rhs;
      } else {
        return value;
      }
    }
  }

  private factor(): number {
    this.skipSpace();
    if (this.src[this.pos] === '-') {
      this.pos += 1;
      return -this.factor();
    }
    if (this.src[this.pos] === '(') {
      this.pos += 1;
      const value = this.expr();
      this.skipSpace();
      if (this.src[this.pos] !== ')') throw new CadenceError('missing ")" in cadence expression');
      this.pos += 1;
      return value;
    }
    return this.number();
  }

  private number(): number {
    this.skipSpace();
    const start = this.pos;
    while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos] as string)) this.pos += 1;
    const text = this.src.slice(start, this.pos);
    if (text === '' || text === '.') {
      throw new CadenceError(`expected a number in cadence expression at position ${start}`);
    }
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) throw new CadenceError(`invalid number "${text}" in cadence expression`);
    return value;
  }

  private skipSpace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos] as string)) this.pos += 1;
  }
}
