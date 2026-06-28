import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { authApi } from './authApi';
import { useAuth } from './AuthContext';
import { mfaRoleOptions } from './mfaRoles';
import { PasskeyLabelModal, registerPasskey } from './passkey';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { AuthShell, Button, Field, MultiSelect, Toggle } from './ui';

type Mode = 'password' | 'mfa' | 'enroll';

export function LoginPage() {
  const { refresh, authLevel, mfa, csrfToken, needsMfaPolicy } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  // Resume a mid-login session (password factor done, second factor pending) after a reload.
  const resuming = authLevel === 'password' && mfa != null;
  const [mode, setMode] = useState<Mode>(resuming ? (mfa.enroll ? 'enroll' : 'mfa') : 'password');
  const [methods, setMethods] = useState<string[]>(mfa?.methods ?? []);
  const [csrf, setCsrf] = useState<string | null>(csrfToken);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [enforcedRoles, setEnforcedRoles] = useState<('admin' | 'user')[]>(['admin']);
  const [totpEnroll, setTotpEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [pkOpen, setPkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loginError'));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: React.FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      const res = await authApi.login(username, password);
      const me = await refresh(); // sets the session cookie; pick up the CSRF token
      setCsrf(me?.csrfToken ?? null);
      if (res.next === 'ok') return; // App re-routes (fully authenticated)
      setMethods(res.methods);
      setMode(res.next === 'enroll_mfa' ? 'enroll' : 'mfa');
    });
  };

  const submitTotp = (e: React.FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      await authApi.mfaTotp(code, csrf ?? '', remember);
      await refresh();
    });
  };

  const passkeyLogin = (): void =>
    void run(async () => {
      const { publicKey } = await authApi.passkeyLoginOptions(csrf ?? '');
      const resp = await startAuthentication({ optionsJSON: publicKey as PublicKeyCredentialRequestOptionsJSON });
      await authApi.passkeyLoginVerify(resp, csrf ?? '', remember);
      await refresh();
    });

  const beginTotpEnroll = (): void =>
    void run(async () => {
      const { qr, secret } = await authApi.totpEnroll(csrf ?? '');
      setTotpEnroll({ qr, secret });
    });

  const activateTotp = (e: React.FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      await authApi.totpActivate(code, csrf ?? '');
      await refresh();
    });
  };

  const enrollPasskey = (label: string | null): void => {
    setPkOpen(false);
    void run(async () => {
      await registerPasskey(label, csrf ?? '');
      await refresh();
    });
  };

  const submitPolicy = (e: React.FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      await authApi.setMfaPolicy(enforcedRoles, csrf ?? '');
      await refresh();
    });
  };

  // The first admin always chooses the MFA-enforcement policy before enrolling.
  if (mode === 'enroll' && needsMfaPolicy) {
    return (
      <AuthShell title={t('loginPolicyTitle')} subtitle={t('loginPolicySubtitle')}>
        <form className="flex flex-col gap-3" onSubmit={submitPolicy}>
          <MultiSelect
            ariaLabel={t('adminMfaRolesAria')}
            placeholder={t('adminNoRoleEnforced')}
            values={enforcedRoles}
            options={mfaRoleOptions(t)}
            onChange={(roles) => setEnforcedRoles(roles as ('admin' | 'user')[])}
          />
          <Button type="submit" disabled={busy}>
            {t('loginContinue')}
          </Button>
        </form>
      </AuthShell>
    );
  }

  if (mode === 'mfa') {
    return (
      <AuthShell title={t('loginMfa')} subtitle={t('loginConfirmItsYou')}>
        {methods.includes('totp') && (
          <form className="flex flex-col gap-3" onSubmit={submitTotp}>
            <Field
              label={t('loginAuthenticatorCode')}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
            />
            <Button type="submit" disabled={busy}>
              {t('loginVerify')}
            </Button>
          </form>
        )}
        {methods.includes('webauthn') && (
          <Button variant="ghost" onClick={passkeyLogin} disabled={busy}>
            {t('loginUsePasskey')}
          </Button>
        )}
        <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-bone-300">
          <Toggle checked={remember} onChange={setRemember} label={t('loginRememberDevice')} />
          {t('loginRememberDevice')}
        </label>
      </AuthShell>
    );
  }

  if (mode === 'enroll') {
    return (
      <AuthShell title={t('loginSetupMfa')} subtitle={t('loginRoleRequiresSecond')}>
        {totpEnroll ? (
          <form className="flex flex-col gap-3" onSubmit={activateTotp}>
            <img src={totpEnroll.qr} alt={t('loginQrAlt')} className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
            <p className="break-all text-center text-xs text-bone-500">{totpEnroll.secret}</p>
            <Field
              label={t('loginEnterCodeConfirm')}
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
            <Button type="submit" disabled={busy}>
              {t('loginActivate')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setTotpEnroll(null);
                setCode('');
              }}
            >
              {t('loginBack')}
            </Button>
          </form>
        ) : (
          <>
            <Button onClick={beginTotpEnroll} disabled={busy}>
              {t('loginSetupAuthenticator')}
            </Button>
            <Button variant="ghost" onClick={() => setPkOpen(true)} disabled={busy}>
              {t('loginRegisterPasskey')}
            </Button>
          </>
        )}
        {pkOpen && <PasskeyLabelModal busy={busy} onSubmit={enrollPasskey} onClose={() => setPkOpen(false)} />}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('loginSignIn')} subtitle={t('loginSubtitle')}>
      <form className="flex flex-col gap-4" onSubmit={submitPassword}>
        <Field label={t('loginUsername')} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        <Field
          label={t('loginPassword')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? t('loginSigningIn') : t('loginSignIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
