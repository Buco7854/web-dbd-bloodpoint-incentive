/** Static metadata for the 15 matchmaking regions BHVR exposes. */
export interface RegionMeta {
  region: string;
  displayName: string;
  flag: string;
  /** Representative IANA timezone, used to model local-time seasonality (forecast). */
  tz: string;
}

/** Canonical region list (BHVR's region ids + our display labels/flags). */
export const REGIONS: readonly RegionMeta[] = [
  { region: 'eu-west-1', displayName: 'EU West (Ireland)', flag: '🇮🇪', tz: 'Europe/Dublin' },
  { region: 'eu-west-2', displayName: 'EU West (London)', flag: '🇬🇧', tz: 'Europe/London' },
  { region: 'eu-central-1', displayName: 'EU Central (Frankfurt)', flag: '🇩🇪', tz: 'Europe/Berlin' },
  { region: 'us-east-1', displayName: 'US East (N. Virginia)', flag: '🇺🇸', tz: 'America/New_York' },
  { region: 'us-east-2', displayName: 'US East (Ohio)', flag: '🇺🇸', tz: 'America/New_York' },
  { region: 'us-west-1', displayName: 'US West (N. California)', flag: '🇺🇸', tz: 'America/Los_Angeles' },
  { region: 'us-west-2', displayName: 'US West (Oregon)', flag: '🇺🇸', tz: 'America/Los_Angeles' },
  { region: 'ca-central-1', displayName: 'Canada (Montreal)', flag: '🇨🇦', tz: 'America/Toronto' },
  { region: 'sa-east-1', displayName: 'South America (São Paulo)', flag: '🇧🇷', tz: 'America/Sao_Paulo' },
  { region: 'ap-southeast-1', displayName: 'SE Asia (Singapore)', flag: '🇸🇬', tz: 'Asia/Singapore' },
  { region: 'ap-southeast-2', displayName: 'Oceania (Sydney)', flag: '🇦🇺', tz: 'Australia/Sydney' },
  { region: 'ap-northeast-1', displayName: 'Asia (Tokyo)', flag: '🇯🇵', tz: 'Asia/Tokyo' },
  { region: 'ap-northeast-2', displayName: 'Asia (Seoul)', flag: '🇰🇷', tz: 'Asia/Seoul' },
  { region: 'ap-east-1', displayName: 'Asia (Hong Kong)', flag: '🇭🇰', tz: 'Asia/Hong_Kong' },
  { region: 'ap-south-1', displayName: 'Asia (Mumbai)', flag: '🇮🇳', tz: 'Asia/Kolkata' },
];

const REGION_INDEX = new Map<string, RegionMeta>(REGIONS.map((r) => [r.region, r]));

export function getRegionMeta(region: string): RegionMeta | undefined {
  return REGION_INDEX.get(region);
}

export function isKnownRegion(region: string): boolean {
  return REGION_INDEX.has(region);
}

export const ALL_REGION_IDS: readonly string[] = REGIONS.map((r) => r.region);
