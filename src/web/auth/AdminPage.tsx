import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ALL_REGION_IDS, getRegionMeta } from '@shared/regions';
import { SUPPORTED_PROVIDERS, platformForProvider, type DbdProvider } from '@shared/platforms';
import { Flag } from '../components/Flag';
import { ArrowLeftIcon, ChevronDownIcon, InfoIcon, KeyIcon, PencilIcon, TrashIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { adminApi, type AdminAgent, type AdminSettings, type AuthUser } from './authApi';
import { useAuth } from './AuthContext';
import { mfaRoleOptions } from './mfaRoles';
import { useI18n, type TFunc } from '../i18n';
import { Button, Field, Modal, MultiSelect, Select, Toggle } from './ui';

/** Flag + display name + slug for a region (matches the contribute page), reused in selects and the table. */
function regionNode(regionId: string): ReactNode {
  const meta = getRegionMeta(regionId);
  return (
    <span className="inline-flex items-center gap-2">
      <Flag region={regionId} className="h-3.5 w-[21px] rounded-sm" />
      {meta?.displayName ?? regionId}
      <span className="font-mono text-xs text-bone-500">{regionId}</span>
    </span>
  );
}

const REGION_OPTIONS = ALL_REGION_IDS.map((r) => ({
  value: r,
  label: getRegionMeta(r)?.displayName ?? r,
  node: regionNode(r),
}));
const PROVIDER_OPTIONS = SUPPORTED_PROVIDERS.map((p) => ({
  value: p,
  label: `${p} (${platformForProvider(p as DbdProvider)})`,
}));
const roleOptions = (t: TFunc) => [
  { value: 'admin', label: t('adminRoleAdmin') },
  { value: 'user', label: t('adminRoleUser') },
];

/** Small pill used for source / role / status. `tinted` adds a subtle blood accent. */
function Badge({ children, tinted }: { children: ReactNode; tinted?: boolean }) {
  return (
    <span
      className={
        tinted
          ? 'inline-flex items-center rounded-full border border-blood-700/40 bg-blood-900/30 px-2 py-0.5 text-xs font-medium text-blood-200'
          : 'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-bone-300'
      }
    >
      {children}
    </span>
  );
}

/** Section card shell with a header (title + count) and a toolbar slot. */
function SectionCard({
  title,
  count,
  toolbar,
  children,
}: {
  title: string;
  count?: number;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-void-800/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-bone-200">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-bone-400">{count}</span>
          )}
        </h2>
        {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      </div>
      {children}
    </section>
  );
}

/** Centered friendly note shown inside a card when a collection is empty. */
function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-sm text-bone-500">
      {children}
    </div>
  );
}

type Modal =
  | { kind: 'token'; token: string }
  | { kind: 'agentInfo'; agent: AdminAgent }
  | { kind: 'retoken'; agent: AdminAgent }
  | { kind: 'region'; agent: AdminAgent }
  | { kind: 'editAgent'; agent: AdminAgent }
  | { kind: 'delete'; agent: AdminAgent }
  | { kind: 'deleteUser'; user: AuthUser }
  | { kind: 'resetMfa'; user: AuthUser }
  | { kind: 'orphans' }
  | { kind: 'createAgent' }
  | { kind: 'createUser' }
  | null;

export function AdminPage({ onHome }: { onHome: () => void }) {
  const { csrfToken, user, refresh } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const csrf = csrfToken ?? '';
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = useCallback(async () => {
    try {
      const [a, s, u] = await Promise.all([adminApi.listAgents(), adminApi.getSettings(), adminApi.listUsers()]);
      setAgents(a.agents);
      setSettings(s);
      setUsers(u.users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('adminFailedToLoad'));
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let stopped = false;
    const tick = (): void => {
      adminApi
        .online()
        .then((r) => {
          if (!stopped) setOnline(r.online);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  /** Run an admin action, then toast success or failure and reload. */
  const act = (fn: () => Promise<unknown>, success: string): void => {
    fn()
      .then(() => {
        toast.success(success);
        return load();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('adminActionFailed')));
  };

  const doExport = (): void => {
    adminApi
      .exportAgents()
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'agents.json';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('adminExportFailed')));
  };

  const doImport = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as { agents?: unknown[] };
        return adminApi.importAgents(parsed.agents ?? [], csrf);
      })
      .then((r) => {
        if (r.skipped.length > 0) {
          toast.error(t('adminImportedWithSkips', { n: r.imported, skipped: r.skipped.length }));
        } else {
          toast.success(t('adminImported', { n: r.imported }));
        }
        return load();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('adminImportFailed')));
    e.target.value = '';
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-3 py-6 sm:px-4">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-bone-100">{t('adminTitle')}</h1>
          <p className="mt-1 text-sm text-bone-500">Manage agents, users and security settings.</p>
          {online !== null && (
            <span
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-void-700/60 px-2.5 py-1 text-xs text-bone-300"
              title={t('adminOnlineHint')}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {t('adminOnlineNow', { n: online })}
            </span>
          )}
        </div>
        <Button variant="ghost" className="h-9 shrink-0 gap-1.5" onClick={onHome}>
          <ArrowLeftIcon className="h-4 w-4" />
          {t('adminBack')}
        </Button>
      </header>

      <div className="flex flex-col gap-4">
        <SectionCard
          title="Agents"
          count={agents.length}
          toolbar={
            <>
              <Button variant="ghost" className="h-8" onClick={() => setModal({ kind: 'orphans' })}>
                {t('adminDeleteOrphans')}
              </Button>
              <Button variant="ghost" className="h-8" onClick={doExport}>
                {t('adminExport')}
              </Button>
              <label className="inline-flex h-8 cursor-pointer items-center rounded-xl border border-white/10 bg-void-700/70 px-3 text-sm text-bone-300 transition hover:border-white/20 hover:text-bone-100">
                {t('adminImport')}
                <input type="file" accept="application/json" className="hidden" onChange={doImport} />
              </label>
              <Button className="h-8" onClick={() => setModal({ kind: 'createAgent' })}>
                {t('adminAddAgent')}
              </Button>
            </>
          }
        >
          {agents.length === 0 ? (
            <EmptyState>No agents yet. Add one to start collecting readings.</EmptyState>
          ) : (
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[48rem] text-left text-sm text-bone-300 [&_td]:px-3 [&_th]:px-3">
                <thead className="text-xs uppercase tracking-wide text-bone-500">
                  <tr className="border-b border-white/10">
                    <th className="py-2 font-medium">{t('adminColId')}</th>
                    <th className="font-medium">{t('adminColRegion')}</th>
                    <th className="font-medium">{t('adminColPlatform')}</th>
                    <th className="font-medium">{t('adminColLabel')}</th>
                    <th className="font-medium">{t('adminColSource')}</th>
                    <th className="font-medium">{t('adminColReadings')}</th>
                    <th className="font-medium">{t('adminColEnabled')}</th>
                    <th className="text-right font-medium">{t('adminColActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="py-2.5 font-mono text-bone-500">{a.id}</td>
                      <td className="py-2.5">
                        {/* Provisioned agents own their region via config, so it's read-only here;
                            a manual agent's region cell is the editor (opens the move modal). */}
                        {a.source === 'provisioned' ? (
                          <span className="inline-flex items-center gap-2 text-sm text-bone-300">{regionNode(a.region)}</span>
                        ) : (
                          <button
                            onClick={() => setModal({ kind: 'region', agent: a })}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-void-700/70 px-2 py-1 text-sm text-bone-200 transition hover:border-white/20 hover:text-bone-100"
                            title={t('adminChangeRegion')}
                          >
                            {regionNode(a.region)}
                            <ChevronDownIcon className="h-3 w-3 text-bone-500" />
                          </button>
                        )}
                      </td>
                      <td className="py-2.5">{a.platform}</td>
                      <td className="py-2.5">{a.label ?? '-'}</td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge tinted={a.source === 'provisioned'}>{a.source}</Badge>
                          {a.source === 'provisioned' && a.provisionId && (
                            <button
                              type="button"
                              title={t('adminProvisionInfo')}
                              aria-label={t('adminProvisionInfo')}
                              className="text-bone-500 transition hover:text-bone-200"
                              onClick={() => setModal({ kind: 'agentInfo', agent: a })}
                            >
                              <InfoIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 tabular-nums">{a.readings}</td>
                      <td className="py-2.5">
                        <Toggle
                          checked={a.enabled}
                          label={a.enabled ? t('adminDisableAgent') : t('adminEnableAgent')}
                          onChange={(next) =>
                            act(() => adminApi.setEnabled(a.id, next, csrf), next ? t('adminAgentEnabled') : t('adminAgentDisabled'))
                          }
                        />
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-3 text-bone-400">
                          {a.source !== 'provisioned' && (
                            <>
                              <button title={t('adminEditLabelPlatform')} className="transition hover:text-bone-100" onClick={() => setModal({ kind: 'editAgent', agent: a })}>
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button title={t('adminRegenerateToken')} className="transition hover:text-bone-100" onClick={() => setModal({ kind: 'retoken', agent: a })}>
                                <KeyIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button title={t('adminDeleteAgent')} className="transition hover:text-blood-300" onClick={() => setModal({ kind: 'delete', agent: a })}>
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Users"
          count={users.length}
          toolbar={
            <Button className="h-8" onClick={() => setModal({ kind: 'createUser' })}>
              {t('adminCreateUser')}
            </Button>
          }
        >
          {users.length === 0 ? (
            <EmptyState>No users yet.</EmptyState>
          ) : (
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[42rem] text-left text-sm text-bone-300 [&_td]:px-3 [&_th]:px-3">
                <thead className="text-xs uppercase tracking-wide text-bone-500">
                  <tr className="border-b border-white/10">
                    <th className="py-2 font-medium">{t('adminColUser')}</th>
                    <th className="font-medium">{t('adminColName')}</th>
                    <th className="font-medium">{t('adminColEmail')}</th>
                    <th className="font-medium">{t('adminColRole')}</th>
                    <th className="font-medium">{t('adminColMfa')}</th>
                    <th className="font-medium">{t('adminColEnabled')}</th>
                    <th className="text-right font-medium">{t('adminColActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="py-2.5 text-bone-200">{u.username}</td>
                      <td className="py-2.5">{u.name ?? '-'}</td>
                      <td className="py-2.5">{u.email ?? '-'}</td>
                      <td className="py-2.5">
                        <div className="w-32">
                          <Select
                            value={u.role}
                            options={roleOptions(t)}
                            ariaLabel={t('adminRoleForUser', { name: u.username })}
                            onChange={(role) => act(() => adminApi.setUserRole(u.id, role as 'admin' | 'user', csrf), t('adminRoleUpdated'))}
                          />
                        </div>
                      </td>
                      <td className="py-2.5">
                        {u.totpEnabled || u.hasPasskey ? <Badge tinted>{t('adminYes')}</Badge> : <Badge>{t('adminNo')}</Badge>}
                      </td>
                      <td className="py-2.5">
                        <Toggle
                          checked={u.enabled}
                          label={u.enabled ? t('adminDisableUser') : t('adminEnableUser')}
                          onChange={(next) => act(() => adminApi.setUserEnabled(u.id, next, csrf), next ? t('adminUserEnabled') : t('adminUserDisabled'))}
                        />
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-3 text-bone-400">
                          {u.id === user?.id ? (
                            <span className="text-xs text-bone-600">{t('adminYou')}</span>
                          ) : (
                            <>
                              {(u.totpEnabled || u.hasPasskey) && (
                                <button title={t('adminResetMfa')} className="transition hover:text-bone-100" onClick={() => setModal({ kind: 'resetMfa', user: u })}>
                                  <KeyIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button title={t('adminDeleteUser')} className="transition hover:text-blood-300" onClick={() => setModal({ kind: 'deleteUser', user: u })}>
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {settings && (
          <SectionCard title={t('adminMfaTitle')}>
            <p className="mb-3 text-xs text-bone-500">{t('adminMfaDesc')}</p>
            <div className="w-full sm:w-64">
              <MultiSelect
                ariaLabel={t('adminMfaRolesAria')}
                placeholder={t('adminNoRoleEnforced')}
                values={settings.mfaEnforcedRoles}
                options={mfaRoleOptions(t)}
                onChange={(roles) =>
                  act(() => adminApi.putSettings({ mfaEnforcedRoles: roles as ('admin' | 'user')[] }, csrf), t('adminMfaUpdated'))
                }
              />
            </div>
          </SectionCard>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="ghost" className="h-9" onClick={() => void authLogout(csrf, refresh).then(onHome)}>
          {t('adminSignOut')}
        </Button>
      </div>

      {modal?.kind === 'token' && <TokenModal token={modal.token} onClose={() => setModal(null)} />}

      {modal?.kind === 'agentInfo' && (
        <Modal title={t('adminProvisionTitle')} onClose={() => setModal(null)}>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-bone-500">{t('adminColId')}</dt>
            <dd className="font-mono text-bone-200">{modal.agent.id}</dd>
            <dt className="text-bone-500">{t('adminProvisionId')}</dt>
            <dd className="break-all font-mono text-bone-100">{modal.agent.provisionId}</dd>
          </dl>
          <div className="flex justify-end">
            <Button variant="ghost" className="h-9" onClick={() => setModal(null)}>
              {t('adminDone')}
            </Button>
          </div>
        </Modal>
      )}

      {modal?.kind === 'retoken' && (
        <ConfirmModal
          title={t('adminRetokenTitle')}
          body={t('adminRetokenBody', { id: modal.agent.id })}
          confirmLabel={t('adminRetokenConfirm')}
          danger
          onClose={() => setModal(null)}
          onConfirm={() =>
            adminApi
              .regenerateToken(modal.agent.id, csrf)
              .then((r) => {
                setModal({ kind: 'token', token: r.token });
                toast.success(t('adminTokenRegenerated'));
                return load();
              })
              .catch((err) => {
                toast.error(err instanceof Error ? err.message : t('adminActionFailed'));
                setModal(null);
              })
          }
        />
      )}

      {modal?.kind === 'region' && (
        <RegionModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSubmit={(next, mode) => {
            act(() => adminApi.changeRegion(modal.agent.id, next, mode, csrf), t('adminRegionChanged'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'editAgent' && (
        <EditAgentModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSubmit={(patch) => {
            act(() => adminApi.updateAgent(modal.agent.id, patch, csrf), t('adminAgentUpdated'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'delete' && (
        <DeleteAgentModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSubmit={(mode) => {
            act(() => adminApi.deleteAgent(modal.agent.id, mode, csrf), t('adminAgentDeleted'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'deleteUser' && (
        <ConfirmModal
          title={t('adminDeleteUserTitle')}
          body={t('adminDeleteUserBody', { name: modal.user.username })}
          confirmLabel={t('adminDelete')}
          danger
          onClose={() => setModal(null)}
          onConfirm={() => {
            act(() => adminApi.deleteUser(modal.user.id, csrf), t('adminUserDeleted'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'resetMfa' && (
        <ConfirmModal
          title={t('adminResetMfaTitle')}
          body={t('adminResetMfaBody', { name: modal.user.username })}
          confirmLabel={t('adminResetMfa')}
          onClose={() => setModal(null)}
          onConfirm={() => {
            act(() => adminApi.resetUserMfa(modal.user.id, csrf), t('adminMfaReset'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'orphans' && (
        <ConfirmModal
          title={t('adminOrphansTitle')}
          body={t('adminOrphansBody')}
          confirmLabel={t('adminOrphansConfirm')}
          danger
          onClose={() => setModal(null)}
          onConfirm={() => {
            act(() => adminApi.deleteOrphans(csrf), t('adminOrphansDeleted'));
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'createAgent' && (
        <CreateAgentModal
          csrf={csrf}
          onClose={() => setModal(null)}
          onDone={(token) => {
            setModal({ kind: 'token', token });
            toast.success(t('adminAgentCreated'));
            void load();
          }}
          onError={(m) => toast.error(m)}
        />
      )}

      {modal?.kind === 'createUser' && (
        <CreateUserModal
          csrf={csrf}
          onClose={() => setModal(null)}
          onDone={(username) => {
            setModal(null);
            toast.success(t('adminCreatedUser', { name: username }));
            void load();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

/** One-time token reveal (the only place the raw token appears). */
function TokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={t('adminTokenTitle')} onClose={onClose}>
      <p className="text-ember-300">{t('adminTokenOnce')}</p>
      <code className="block max-h-40 overflow-auto break-all rounded-lg bg-void-900/70 px-3 py-3 font-mono text-base leading-relaxed text-bone-100">
        {token}
      </code>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          className="h-9"
          onClick={() => {
            void navigator.clipboard?.writeText(token);
            setCopied(true);
          }}
        >
          {copied ? t('adminCopied') : t('adminCopy')}
        </Button>
        <Button className="h-9" onClick={onClose}>
          {t('adminDone')}
        </Button>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose}>
      <p>{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('adminCancel')}
        </Button>
        <Button className={`h-9 ${danger ? 'bg-blood-600/90 hover:bg-blood-600' : ''}`} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Radio list for what happens to an agent's readings. */
function DataModeChoice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; title: string; desc: string }[];
}) {
  const { t } = useI18n();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs uppercase text-bone-500">{t('adminExistingReadings')}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2">
          <input type="radio" name="dataMode" checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1" />
          <span>
            <span className="text-bone-200">{o.title}</span> - {o.desc}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function RegionModal({
  agent,
  onSubmit,
  onClose,
}: {
  agent: AdminAgent;
  onSubmit: (region: string, mode: 'keep' | 'orphan' | 'delete') => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [next, setNext] = useState(agent.region);
  const [mode, setMode] = useState<'keep' | 'orphan' | 'delete'>('keep');
  return (
    <Modal title={t('adminMoveAgent', { id: agent.id })} onClose={onClose}>
      <label className="flex flex-col gap-1">
        {t('adminNewRegionCurrent', { region: agent.region })}
        <Select value={next} options={REGION_OPTIONS} onChange={setNext} ariaLabel={t('adminNewRegionAria')} />
      </label>
      <DataModeChoice
        value={mode}
        onChange={(v) => setMode(v as 'keep' | 'orphan' | 'delete')}
        options={[
          { value: 'keep', title: t('adminModeKeepTitle'), desc: t('adminModeKeepDesc') },
          { value: 'orphan', title: t('adminModeOrphanTitle'), desc: t('adminModeOrphanDescRegion') },
          { value: 'delete', title: t('adminModeDeleteTitle'), desc: t('adminModeDeleteDescRegion') },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('adminCancel')}
        </Button>
        <Button className="h-9" disabled={next === agent.region} onClick={() => onSubmit(next, mode)}>
          {t('adminMove')}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteAgentModal({
  agent,
  onSubmit,
  onClose,
}: {
  agent: AdminAgent;
  onSubmit: (mode: 'orphan' | 'delete') => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'orphan' | 'delete'>('orphan');
  return (
    <Modal title={t('adminDeleteAgentTitle', { id: agent.id })} onClose={onClose}>
      <p>{t('adminDeleteAgentBody')}</p>
      <DataModeChoice
        value={mode}
        onChange={(v) => setMode(v as 'orphan' | 'delete')}
        options={[
          { value: 'orphan', title: t('adminModeOrphanTitle'), desc: t('adminModeOrphanDescDelete') },
          { value: 'delete', title: t('adminModeDeleteTitle'), desc: t('adminModeDeleteDescDelete') },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('adminCancel')}
        </Button>
        <Button className="h-9 bg-blood-600/90 hover:bg-blood-600" onClick={() => onSubmit(mode)}>
          {t('adminDelete')}
        </Button>
      </div>
    </Modal>
  );
}

function EditAgentModal({
  agent,
  onSubmit,
  onClose,
}: {
  agent: AdminAgent;
  onSubmit: (patch: { label: string | null; provider: string }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(agent.label ?? '');
  const [provider, setProvider] = useState(agent.provider);
  return (
    <Modal title={t('adminEditAgent', { id: agent.id })} onClose={onClose}>
      <div className="w-full">
        <Field label={t('adminLabel')} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <label className="flex flex-col gap-1 text-sm text-bone-300">
        {t('adminPlatform')}
        <Select value={provider} options={PROVIDER_OPTIONS} onChange={setProvider} ariaLabel={t('adminPlatform')} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('adminCancel')}
        </Button>
        <Button className="h-9" onClick={() => onSubmit({ label: label.trim() || null, provider })}>
          {t('adminSave')}
        </Button>
      </div>
    </Modal>
  );
}

function CreateAgentModal({
  csrf,
  onDone,
  onError,
  onClose,
}: {
  csrf: string;
  onDone: (token: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [region, setRegion] = useState(ALL_REGION_IDS[0] ?? 'eu-central-1');
  const [provider, setProvider] = useState<string>(SUPPORTED_PROVIDERS[0] ?? 'steam');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    setBusy(true);
    adminApi
      .createAgent({ region, provider, label: label || undefined }, csrf)
      .then((res) => onDone(res.token))
      .catch((err) => {
        onError(err instanceof Error ? err.message : t('adminCreateFailed'));
        setBusy(false);
      });
  };

  return (
    <Modal title={t('adminAddAgent')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-sm text-bone-300">
          {t('adminRegion')}
          <Select value={region} options={REGION_OPTIONS} onChange={setRegion} ariaLabel={t('adminRegion')} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-bone-300">
          {t('adminProvider')}
          <Select value={provider} options={PROVIDER_OPTIONS} onChange={setProvider} ariaLabel={t('adminProvider')} />
        </label>
        <Field label={t('adminLabelOptional')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-9" onClick={onClose}>
            {t('adminCancel')}
          </Button>
          <Button type="submit" className="h-9" disabled={busy}>
            {busy ? t('adminCreating') : t('adminCreate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({
  csrf,
  onDone,
  onError,
  onClose,
}: {
  csrf: string;
  onDone: (username: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    setBusy(true);
    adminApi
      .createUser(
        {
          username,
          password,
          role: role as 'admin' | 'user',
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        },
        csrf,
      )
      .then(() => onDone(username))
      .catch((err) => {
        onError(err instanceof Error ? err.message : t('adminCreateFailed'));
        setBusy(false);
      });
  };

  const optional = (label: string): string => `${label} (${t('adminOptional')})`;

  return (
    <Modal title={t('adminCreateUser')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t('adminUsername')} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
        <Field label={t('adminPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <Field label={optional(t('adminName'))} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <Field label={optional(t('adminEmail'))} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <label className="flex flex-col gap-1 text-sm text-bone-300">
          {t('adminRole')}
          <Select value={role} options={roleOptions(t)} onChange={setRole} ariaLabel={t('adminRole')} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-9" onClick={onClose}>
            {t('adminCancel')}
          </Button>
          <Button type="submit" className="h-9" disabled={busy}>
            {busy ? t('adminCreating') : t('adminCreate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

async function authLogout(csrf: string, refresh: () => Promise<unknown>): Promise<void> {
  const { authApi } = await import('./authApi');
  await authApi.logout(csrf);
  await refresh();
}
