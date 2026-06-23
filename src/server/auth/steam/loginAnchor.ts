/**
 * Selects the version "anchor" for the BHVR Steam login headers: the highest
 * semver present in BOTH the server's availableVersions and the live-keys map,
 * plus that semver's content id (its highest build) and secret key. Pure so it
 * can be unit tested without any network.
 *
 * availableVersions is keyed by `${semver}_${buildId}live` (e.g.
 * "10.0.1_3460394live"); liveKeys is keyed by plain semver (e.g. "10.0.1").
 */
export interface AnchorInput {
  availableVersions: Record<string, unknown>;
  /** semver -> secret key (already filtered to *_live and stripped of the suffix). */
  liveKeys: Record<string, string>;
}

export interface Anchor {
  /** Plain semver, e.g. "10.0.1". */
  pattern: string;
  /** The availableVersions key with the highest build for the pattern. */
  contentVersionId: string;
  secretKey: string;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface ParsedVersion {
  semver: string;
  buildId: number;
  key: string;
}

/** Parse "10.0.1_3460394live" -> { semver: "10.0.1", buildId: 3460394, key }. */
function parseAvailableKey(key: string): ParsedVersion | null {
  const sep = key.indexOf('_');
  if (sep <= 0) return null;
  const semver = key.slice(0, sep);
  const buildId = Number.parseInt(key.slice(sep + 1), 10);
  return { semver, buildId: Number.isFinite(buildId) ? buildId : 0, key };
}

export function selectAnchor(input: AnchorInput): Anchor {
  // Highest-build entry per semver.
  const bySemver = new Map<string, ParsedVersion>();
  for (const key of Object.keys(input.availableVersions)) {
    const parsed = parseAvailableKey(key);
    if (!parsed) continue;
    const existing = bySemver.get(parsed.semver);
    if (!existing || parsed.buildId > existing.buildId) bySemver.set(parsed.semver, parsed);
  }

  const common = [...bySemver.keys()].filter((s) => s in input.liveKeys);
  if (common.length === 0) {
    throw new Error('no version pattern is present in both availableVersions and the live-keys map');
  }

  const pattern = common.sort((a, b) => compareSemver(b, a))[0] as string;
  const top = bySemver.get(pattern) as ParsedVersion;
  return {
    pattern,
    contentVersionId: top.key,
    secretKey: input.liveKeys[pattern] as string,
  };
}

/** Parse keyapi.deadbyqueue.com/keys into pattern -> key, keeping only *_live. */
export function parseLiveKeys(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let entries: [string, unknown][] = [];
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    entries = Object.entries(parsed);
  } catch {
    // Fall back to line parsing: "version_branch": "key"
    for (const line of body.split('\n')) {
      const match = line.match(/"([^"]+)"\s*:\s*"([^"]+)"/);
      if (match?.[1] && match[2]) entries.push([match[1], match[2]]);
    }
  }
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue;
    if (!key.endsWith('_live')) continue;
    out[key.slice(0, -'_live'.length)] = value;
  }
  return out;
}
