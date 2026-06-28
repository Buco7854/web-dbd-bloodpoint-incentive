import { useCallback, useEffect, useState } from 'react';
import { TrashIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { authApi, type ApiKey } from './authApi';
import { useAuth } from './AuthContext';
import { PasskeyLabelModal, registerPasskey } from './passkey';
import { Button, Field, Modal, Toggle } from './ui';

interface Passkey {
  id: number;
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

/** Self-service security page: change password, manage TOTP, add/remove passkeys. */
export function AccountPage({ onHome }: { onHome: () => void }) {
  const { user, csrfToken, refresh, enableApiKeys } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const csrf = csrfToken ?? '';
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keyLabel, setKeyLabel] = useState('');
  const [keyExpiry, setKeyExpiry] = useState('');
  const [keyForm, setKeyForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [totp, setTotp] = useState<{ qr: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pkOpen, setPkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPasskeys = useCallback(() => {
    authApi
      .passkeys()
      .then((r) => setPasskeys(r.passkeys))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountFailedLoadPasskeys')));
  }, [toast, t]);

  const loadKeys = useCallback(() => {
    if (!enableApiKeys) return;
    authApi
      .apiKeys()
      .then((r) => setApiKeys(r.apiKeys))
      .catch(() => undefined);
  }, [enableApiKeys]);

  useEffect(() => {
    loadPasskeys();
    loadKeys();
  }, [loadPasskeys, loadKeys]);

  const createKey = (e: React.FormEvent): void => {
    e.preventDefault();
    setBusy(true);
    // The date input is local; expire at the end of the chosen day.
    const expiresAt = keyExpiry ? new Date(`${keyExpiry}T23:59:59`).getTime() : undefined;
    authApi
      .createApiKey({ label: keyLabel.trim() || undefined, expiresAt }, csrf)
      .then((r) => {
        setNewKey(r.key);
        setKeyForm(false);
        setKeyLabel('');
        setKeyExpiry('');
        loadKeys();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountSomethingWrong')))
      .finally(() => setBusy(false));
  };

  const toggleKey = (id: number, enabled: boolean): void => {
    setBusy(true);
    authApi
      .updateApiKey(id, enabled, csrf)
      .then(() => {
        toast.success(enabled ? t('accountApiKeyEnabledToast') : t('accountApiKeyDisabledToast'));
        loadKeys();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountSomethingWrong')))
      .finally(() => setBusy(false));
  };

  const revokeKey = (id: number): void => {
    setBusy(true);
    authApi
      .deleteApiKey(id, csrf)
      .then(() => {
        toast.success(t('accountApiKeyRevokedToast'));
        loadKeys();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountSomethingWrong')))
      .finally(() => setBusy(false));
  };

  const run = (fn: () => Promise<unknown>, success: string): void => {
    setBusy(true);
    fn()
      .then(() => {
        toast.success(success);
        return refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountSomethingWrong')))
      .finally(() => setBusy(false));
  };

  const changePassword = (e: React.FormEvent): void => {
    e.preventDefault();
    run(
      () => authApi.changePassword(curPw, newPw, csrf).then(() => {
        setCurPw('');
        setNewPw('');
      }),
      t('accountPasswordChanged'),
    );
  };

  const beginTotp = (): void => {
    setBusy(true);
    authApi
      .totpEnroll(csrf)
      .then(({ qr, secret }) => setTotp({ qr, secret }))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountCouldNotStartEnrollment')))
      .finally(() => setBusy(false));
  };

  const activateTotp = (e: React.FormEvent): void => {
    e.preventDefault();
    run(
      () =>
        authApi.totpActivate(totpCode, csrf).then(() => {
          setTotp(null);
          setTotpCode('');
        }),
      t('accountTotpSetUpToast'),
    );
  };

  const disableTotp = (): void => run(() => authApi.totpDisable(csrf), t('accountTotpRemovedToast'));

  const forgetDevices = (): void => run(() => authApi.forgetDevices(csrf), t('accountDevicesForgottenToast'));

  const addPasskey = (label: string | null): void => {
    setBusy(true);
    registerPasskey(label, csrf)
      .then(() => {
        toast.success(t('accountPasskeyAdded'));
        setPkOpen(false);
        loadPasskeys();
        return refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountCouldNotAddPasskey')))
      .finally(() => setBusy(false));
  };

  const removePasskey = (id: number): void => {
    setBusy(true);
    authApi
      .deletePasskey(id, csrf)
      .then(() => {
        toast.success(t('accountPasskeyRemoved'));
        loadPasskeys();
        return refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('accountCouldNotRemovePasskey')))
      .finally(() => setBusy(false));
  };

  const card = 'mt-4 rounded-xl border border-white/10 bg-void-800/60 p-3 sm:p-4';

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-bone-100">{t('accountTitle')}</h1>
        <Button variant="ghost" className="h-9 shrink-0" onClick={onHome}>
          {t('accountBack')}
        </Button>
      </div>

      <section className={card}>
        <h2 className="mb-3 font-semibold text-bone-200">{t('accountPasswordSection')}</h2>
        <form className="flex flex-col gap-3 sm:max-w-sm" onSubmit={changePassword}>
          <Field label={t('accountCurrentPassword')} type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" required />
          <Field label={t('accountNewPassword')} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required />
          <Button type="submit" className="h-9 self-start" disabled={busy}>
            {t('accountChangePassword')}
          </Button>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold text-bone-200">{t('accountTotpSection')}</h2>
        <p className="mb-3 text-xs text-bone-500">
          {user?.totpEnabled ? t('accountTotpEnabled') : t('accountTotpNone')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className="h-9" disabled={busy} onClick={beginTotp}>
            {user?.totpEnabled ? t('accountTotpReplace') : t('accountTotpSetUp')}
          </Button>
          {user?.totpEnabled && (
            <Button variant="ghost" className="h-9" disabled={busy} onClick={disableTotp}>
              {t('accountTotpRemove')}
            </Button>
          )}
        </div>
      </section>

      {totp && (
        <Modal title={t('accountTotpModalTitle')} onClose={() => { setTotp(null); setTotpCode(''); }}>
          <form className="flex flex-col items-center gap-3" onSubmit={activateTotp}>
            <img src={totp.qr} alt={t('accountTotpQrAlt')} className="h-44 w-44 rounded-lg bg-white p-2" />
            <p className="w-full break-all text-center text-xs text-bone-500">{totp.secret}</p>
            <Field
              label={t('accountTotpEnterCode')}
              inputMode="numeric"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder={t('accountTotpCodePlaceholder')}
              className="w-full"
              autoFocus
            />
            <div className="flex w-full gap-2">
              <Button type="submit" className="h-9 flex-1" disabled={busy}>
                {t('accountConfirm')}
              </Button>
              <Button type="button" variant="ghost" className="h-9 flex-1" disabled={busy} onClick={() => { setTotp(null); setTotpCode(''); }}>
                {t('accountCancel')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {pkOpen && <PasskeyLabelModal busy={busy} onSubmit={addPasskey} onClose={() => setPkOpen(false)} />}

      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-bone-200">{t('accountPasskeysSection')}</h2>
          <Button className="h-8" disabled={busy} onClick={() => setPkOpen(true)}>
            {t('accountAddPasskey')}
          </Button>
        </div>
        {passkeys.length === 0 ? (
          <p className="text-xs text-bone-500">{t('accountNoPasskeys')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-bone-300">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-void-700/40 px-3 py-2">
                <span className="truncate">
                  {p.label || t('accountPasskeyLabel', { id: p.id })}
                  {p.lastUsedAt && <span className="ml-2 text-xs text-bone-500">{t('accountLastUsed', { date: new Date(p.lastUsedAt).toLocaleDateString() })}</span>}
                </span>
                <button title={t('accountRemove')} className="shrink-0 text-bone-400 transition hover:text-blood-300 disabled:opacity-50" disabled={busy} onClick={() => removePasskey(p.id)}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold text-bone-200">{t('accountDevicesSection')}</h2>
        <p className="mb-3 text-xs text-bone-500">{t('accountDevicesHint')}</p>
        <Button variant="ghost" className="h-9" disabled={busy} onClick={forgetDevices}>
          {t('accountForgetDevices')}
        </Button>
      </section>

      {enableApiKeys && (
        <section className={card}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-bone-200">{t('accountApiKeysSection')}</h2>
            <Button className="h-8" disabled={busy} onClick={() => setKeyForm(true)}>
              {t('accountCreateApiKey')}
            </Button>
          </div>
          <p className="mb-3 text-xs text-bone-500">{t('accountApiKeysHint')}</p>
          {apiKeys.length === 0 ? (
            <p className="text-xs text-bone-500">{t('accountNoApiKeys')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm text-bone-300">
              {apiKeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-void-700/40 px-3 py-2">
                  <span className="truncate">
                    <code className="text-bone-200">{k.prefix}…</code>
                    {k.label && <span className="ml-2">{k.label}</span>}
                    <span className="ml-2 text-xs text-bone-500">
                      {k.expiresAt ? t('accountApiKeyExpires', { date: new Date(k.expiresAt).toLocaleDateString() }) : t('accountApiKeyNeverExpires')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Toggle
                      checked={k.enabled}
                      disabled={busy}
                      onChange={(next) => toggleKey(k.id, next)}
                      label={k.enabled ? t('accountApiKeyDisable') : t('accountApiKeyEnable')}
                    />
                    <button title={t('accountRemove')} className="text-bone-400 transition hover:text-blood-300 disabled:opacity-50" disabled={busy} onClick={() => revokeKey(k.id)}>
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {keyForm && (
        <Modal title={t('accountCreateApiKey')} onClose={() => { if (!busy) setKeyForm(false); }}>
          <form className="flex flex-col gap-3" onSubmit={createKey}>
            <Field
              label={t('accountApiKeyLabelField')}
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <Field
              label={t('accountApiKeyExpiryField')}
              type="date"
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
              value={keyExpiry}
              onChange={(e) => setKeyExpiry(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" className="h-9 flex-1" disabled={busy}>
                {t('accountCreateApiKey')}
              </Button>
              <Button type="button" variant="ghost" className="h-9 flex-1" disabled={busy} onClick={() => setKeyForm(false)}>
                {t('accountCancel')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {newKey && (
        <Modal title={t('accountApiKeysSection')} onClose={() => setNewKey(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ember-300">{t('accountApiKeyShownOnce')}</p>
            <code className="block w-full break-all rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-xs text-bone-200">{newKey}</code>
            <div className="flex gap-2">
              <Button
                type="button"
                className="h-9 flex-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(newKey);
                  toast.success(t('accountApiKeyCopied'));
                }}
              >
                {t('accountApiKeyCopy')}
              </Button>
              <Button type="button" variant="ghost" className="h-9 flex-1" onClick={() => setNewKey(null)}>
                {t('accountConfirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
