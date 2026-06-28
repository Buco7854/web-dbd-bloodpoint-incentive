import { useCallback, useEffect, useState } from 'react';

/** The client-side views. `region` carries the region id shown in its history page. */
export type Route =
  | { name: 'home' }
  | { name: 'register' }
  | { name: 'region'; id: string }
  | { name: 'login' }
  | { name: 'setup' }
  | { name: 'admin' }
  | { name: 'account' }
  | { name: 'notfound' };

const REGION_PATH = /^\/region\/([^/]+)$/;

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function toRoute(pathname: string): Route {
  const path = normalize(pathname);
  if (path === '/') return { name: 'home' };
  if (path === '/register') return { name: 'register' };
  if (path === '/login') return { name: 'login' };
  if (path === '/setup') return { name: 'setup' };
  if (path === '/admin') return { name: 'admin' };
  if (path === '/account') return { name: 'account' };
  const m = REGION_PATH.exec(path);
  if (m?.[1]) return { name: 'region', id: decodeURIComponent(m[1]) };
  return { name: 'notfound' };
}

function toPath(route: Route): string {
  if (route.name === 'register') return '/register';
  if (route.name === 'login') return '/login';
  if (route.name === 'setup') return '/setup';
  if (route.name === 'admin') return '/admin';
  if (route.name === 'account') return '/account';
  if (route.name === 'region') return `/region/${encodeURIComponent(route.id)}`;
  return '/';
}

/**
 * Minimal client-side routing via the History API (no router dependency). The hub
 * serves the SPA shell for any non-API path, so real URLs work and are shareable.
 */
export function useRoute(): readonly [Route, (to: Route) => void] {
  const [route, setRoute] = useState<Route>(() => toRoute(window.location.pathname));

  useEffect(() => {
    const onPop = (): void => setRoute(toRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: Route): void => {
    const path = toPath(to);
    if (normalize(window.location.pathname) !== path) {
      window.history.pushState(null, '', path);
      window.scrollTo(0, 0);
    }
    setRoute(to);
  }, []);

  return [route, navigate] as const;
}
