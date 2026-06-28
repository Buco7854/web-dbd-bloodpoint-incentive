import { headlinePercent } from '@shared/incentive';
import type { RegionIncentive } from '@shared/types';

export type QuickFilter = 'all' | 'survivor' | 'killer' | 'bonus';
export type SortKey = 'name' | 'bonus';

export interface Controls {
  search: string;
  filter: QuickFilter;
  sort: SortKey;
}

export const DEFAULT_CONTROLS: Controls = { search: '', filter: 'all', sort: 'name' };

function matchesFilter(r: RegionIncentive, filter: QuickFilter): boolean {
  switch (filter) {
    case 'survivor':
      return r.survivor > 0 && r.survivor >= r.killer;
    case 'killer':
      return r.killer > 0 && r.killer >= r.survivor;
    case 'bonus':
      return r.survivor > 0 || r.killer > 0;
    default:
      return true;
  }
}

/** Search + quick-filter + sort. Default sort is alphabetical by display name. */
export function applyControls(regions: RegionIncentive[], c: Controls): RegionIncentive[] {
  const q = c.search.trim().toLowerCase();
  const filtered = regions.filter((r) => {
    if (q && !`${r.displayName} ${r.region}`.toLowerCase().includes(q)) return false;
    return matchesFilter(r, c.filter);
  });

  return filtered.sort((a, b) => {
    if (c.sort === 'bonus') {
      const diff = headlinePercent(b.survivor, b.killer) - headlinePercent(a.survivor, a.killer);
      if (diff !== 0) return diff;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}
