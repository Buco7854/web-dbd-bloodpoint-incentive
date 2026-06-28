import { useEffect, useMemo } from 'react';
import { ALL_REGION_IDS, getRegionMeta } from '@shared/regions';
import { Controls } from './components/Controls';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { Footer } from './components/Footer';
import { FreshnessChip } from './components/FreshnessChip';
import { Header } from './components/Header';
import { Pagination } from './components/Pagination';
import { RegionHistoryPage } from './components/RegionHistoryPage';
import { RegisterPage } from './components/RegisterPage';
import { ToastProvider } from './components/Toast';
import { RegistrationBanner } from './components/RegistrationBanner';
import { RegionCard } from './components/RegionCard';
import { RegionGrid } from './components/RegionGrid';
import { RegionLocator } from './components/RegionLocator';
import { SkeletonGrid } from './components/Skeletons';
import { DisconnectedNotice, StatusNotice } from './components/StatusNotice';
import { useI18n } from './i18n';
import { useClosestRegion } from './hooks/useClosestRegion';
import { useIncentives } from './hooks/useIncentives';
import { useNow } from './hooks/useNow';
import { usePlatform } from './hooks/usePlatform';
import { useRegionOverride } from './hooks/useRegionOverride';
import { useRoute, type Route } from './hooks/useRoute';
import { useViewState } from './hooks/useViewState';
import { applyControls, type QuickFilter, type SortKey } from './lib/controls';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SetupPage } from './auth/SetupPage';
import { LoginPage } from './auth/LoginPage';
import { AccountPage } from './auth/AccountPage';
import { AdminPage } from './auth/AdminPage';

interface DashboardProps {
  route: Route;
  navigate: (to: Route) => void;
}

function Dashboard({ route, navigate }: DashboardProps) {
  const { t } = useI18n();
  const [platform, setPlatform] = usePlatform();
  const { data, error, loading, refresh, refreshing, disconnected } = useIncentives(platform);
  const now = useNow(1000);

  const [view, setView] = useViewState();
  const { search, filter, sort, page } = view;

  const regions = data?.regions ?? [];
  const locate = useClosestRegion();
  const [regionOverride, setRegionOverride] = useRegionOverride();
  // A manual override always wins, even if this instance doesn't cover that region.
  const selectedRegion = regionOverride ?? locate.region;
  const selectedCovered = selectedRegion != null && regions.some((r) => r.region === selectedRegion);
  const selectedName =
    (selectedRegion ? getRegionMeta(selectedRegion)?.displayName : null) ?? selectedRegion;
  // Only highlight a card when the visitor's region is actually shown here.
  const userRegion = selectedCovered ? selectedRegion : null;
  // The picker offers every DBD region, so a visitor can pin one we don't cover.
  const allRegionOptions = ALL_REGION_IDS.map((id) => ({
    region: id,
    displayName: getRegionMeta(id)?.displayName ?? id,
  }));
  const processed = useMemo(
    () => applyControls(regions, { search, filter, sort }),
    [regions, search, filter, sort],
  );

  const pageSize = data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = processed.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  // A platform that serves a single region uses the focused, control-free layout.
  const forced = (data?.regions.length ?? 0) === 1;
  const showControls = !forced;
  const single = forced || processed.length === 1;
  const contributeEnabled = data?.contributeEnabled ?? false;
  const showRegister = route.name === 'register' && contributeEnabled;
  const openRegion = (id: string): void => navigate({ name: 'region', id });

  const onSearch = (v: string): void => setView((s) => ({ ...s, search: v, page: 0 }));
  const onFilter = (f: QuickFilter): void => setView((s) => ({ ...s, filter: f, page: 0 }));
  const onSort = (so: SortKey): void => setView((s) => ({ ...s, sort: so }));
  const onPage = (p: number): void => setView((s) => ({ ...s, page: p }));
  const resetControls = (): void => setView((s) => ({ ...s, search: '', filter: 'all', page: 0 }));

  const renderBody = () => {
    if (loading && !data) return <SkeletonGrid />;
    if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />;
    if (processed.length === 0) return <EmptyState onReset={resetControls} />;
    // A single region is just one card in a constrained single column (no hero),
    // so it doesn't stretch across wide screens.
    if (single && processed[0])
      return (
        <div className="mx-auto max-w-md">
          <RegionCard
            region={processed[0]}
            now={now}
            isUserRegion={processed[0].region === userRegion}
            onOpen={openRegion}
          />
        </div>
      );
    return (
      <>
        <RegionGrid regions={paged} now={now} userRegion={userRegion} onOpen={openRegion} />
        {pageCount > 1 && (
          <div className="mt-8">
            <Pagination page={clampedPage} pageCount={pageCount} onPage={onPage} />
          </div>
        )}
      </>
    );
  };

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <Header
        data={data}
        onRefresh={refresh}
        refreshing={refreshing}
        onRegister={() => navigate({ name: 'register' })}
        onHome={() => navigate({ name: 'home' })}
        onPlatform={setPlatform}
        onAdmin={() => navigate({ name: 'admin' })}
        onAccount={() => navigate({ name: 'account' })}
        onLogin={() => navigate({ name: 'login' })}
      />
      <DisclaimerBanner contactEmail={data?.contactEmail ?? null} />
      {route.name === 'home' && contributeEnabled && (
        <RegistrationBanner onRegister={() => navigate({ name: 'register' })} />
      )}

      {route.name === 'admin' ? (
        <AdminPage onHome={() => navigate({ name: 'home' })} />
      ) : route.name === 'account' ? (
        <AccountPage onHome={() => navigate({ name: 'home' })} />
      ) : route.name === 'region' ? (
        <RegionHistoryPage
          data={data}
          platform={platform}
          regionId={route.id}
          now={now}
          onBack={() => navigate({ name: 'home' })}
        />
      ) : showRegister ? (
        <RegisterPage data={data} onBack={() => navigate({ name: 'home' })} />
      ) : (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-wide text-bone-100 sm:text-4xl">
                  {t('title')}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-bone-400">{t('subtitle')}</p>
              </div>
              {data && <FreshnessChip data={data} now={now} className="self-end" />}
            </div>

            {disconnected && data && <DisconnectedNotice />}
            {data && <StatusNotice status={data.status} />}

            {showControls && data && (
              <Controls
                search={search}
                onSearch={onSearch}
                filter={filter}
                onFilter={onFilter}
                sort={sort}
                onSort={onSort}
                total={regions.length}
                shown={processed.length}
              />
            )}

            <div>
              <RegionLocator
                status={locate.status}
                onRetry={locate.retry}
                regions={allRegionOptions}
                override={regionOverride}
                onOverride={setRegionOverride}
                detected={locate.region}
                notCoveredName={!selectedCovered ? selectedName : null}
              />
              {renderBody()}
            </div>
          </div>
        </main>
      )}

      <Footer data={data} />
    </div>
  );
}

/** Full-screen centered message (used for the brief loading and not-authorized states). */
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-void-900 text-bone-400">{children}</div>;
}

function NotFound({ onHome }: { onHome: () => void }) {
  const { t } = useI18n();
  return (
    <Centered>
      <div className="px-4 text-center">
        <p className="font-display text-5xl font-bold text-bone-100">404</p>
        <p className="mt-2 text-bone-300">{t('notFoundTitle')}</p>
        <p className="mt-1 text-sm text-bone-500">{t('notFoundBody')}</p>
        <button className="mt-4 text-blood-400 hover:text-blood-300" onClick={onHome}>
          {t('appBackOverview')}
        </button>
      </div>
    </Centered>
  );
}

/** Returns the route to redirect to, or null when the current route is allowed. */
function redirectFor(auth: ReturnType<typeof useAuth>, route: Route): Route | null {
  if (auth.loading) return null;
  if (auth.needsSetup) return route.name === 'setup' ? null : { name: 'setup' };
  if (route.name === 'setup') return { name: auth.authenticated ? 'home' : 'login' };
  if (auth.authLevel === 'password') return route.name === 'login' ? null : { name: 'login' };
  if (route.name === 'login') return auth.authenticated ? { name: 'home' } : null;
  if ((route.name === 'admin' || route.name === 'account') && !auth.authenticated) return { name: 'login' };
  if (auth.requireAuth && !auth.authenticated) return { name: 'login' };
  return null;
}

/** Auth-aware shell: setup, login gate, and admin sit in front of the public dashboard. */
function AppRoutes() {
  const [route, navigate] = useRoute();
  const auth = useAuth();
  const { t } = useI18n();

  const target = redirectFor(auth, route);
  useEffect(() => {
    if (target) navigate(target);
  }, [target?.name, navigate]);

  if (auth.loading || target) return <Centered>{t('appLoading')}</Centered>;

  switch (route.name) {
    case 'setup':
      return <SetupPage />;
    case 'login':
      return <LoginPage />;
    case 'notfound':
      return <NotFound onHome={() => navigate({ name: 'home' })} />;
    case 'admin':
      if (auth.user?.role !== 'admin') {
        return (
          <Centered>
            <div className="text-center">
              <p>{t('appNoAdminAccess')}</p>
              <button className="mt-3 text-blood-400 hover:text-blood-300" onClick={() => navigate({ name: 'home' })}>
                {t('appBackOverview')}
              </button>
            </div>
          </Centered>
        );
      }
      return <Dashboard route={route} navigate={navigate} />;
    default:
      return <Dashboard route={route} navigate={navigate} />;
  }
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
