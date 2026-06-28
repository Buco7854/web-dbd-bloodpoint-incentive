import { useEffect, useState } from 'react';
import { DEFAULT_CONTROLS, type QuickFilter, type SortKey } from '../lib/controls';

export interface ViewState {
  search: string;
  filter: QuickFilter;
  sort: SortKey;
  /** Zero-based page index (stored 1-based in the URL). */
  page: number;
}

const FILTERS: QuickFilter[] = ['all', 'survivor', 'killer', 'bonus'];
const SORTS: SortKey[] = ['name', 'bonus'];

function parseUrl(): ViewState {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter') as QuickFilter | null;
  const sort = params.get('sort') as SortKey | null;
  const pageRaw = Number.parseInt(params.get('page') ?? '', 10);
  return {
    search: params.get('q') ?? DEFAULT_CONTROLS.search,
    filter: filter && FILTERS.includes(filter) ? filter : DEFAULT_CONTROLS.filter,
    sort: sort && SORTS.includes(sort) ? sort : DEFAULT_CONTROLS.sort,
    page: Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw - 1 : 0,
  };
}

function toUrl(s: ViewState): string {
  const params = new URLSearchParams();
  if (s.search.trim()) params.set('q', s.search.trim());
  if (s.filter !== 'all') params.set('filter', s.filter);
  if (s.sort !== 'name') params.set('sort', s.sort);
  if (s.page > 0) params.set('page', String(s.page + 1));
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
}

/**
 * View state (search / filter / sort / page) mirrored into the URL query so a
 * link reproduces the exact view. Uses replaceState to avoid history spam.
 */
export function useViewState(): readonly [ViewState, (next: (prev: ViewState) => ViewState) => void] {
  const [state, setState] = useState<ViewState>(parseUrl);

  useEffect(() => {
    window.history.replaceState(null, '', toUrl(state));
  }, [state]);

  useEffect(() => {
    const onPop = (): void => setState(parseUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const update = (next: (prev: ViewState) => ViewState): void => setState(next);
  return [state, update] as const;
}
