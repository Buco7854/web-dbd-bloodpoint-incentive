import { useState } from 'react';
import { authApi } from './authApi';
import { useAuth } from './AuthContext';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { AuthShell, Button, Field } from './ui';

/** First-run page: create the initial administrator. MFA enrollment follows. */
export function SetupPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.setup({ username, password, email: email || undefined, name: name || undefined });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setupError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('setupTitle')} subtitle={t('setupSubtitle')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t('setupUsername')} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        <Field label={t('setupName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <Field label={t('setupEmail')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Field
          label={t('setupPassword')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? t('setupCreating') : t('setupCreateAdmin')}
        </Button>
      </form>
    </AuthShell>
  );
}
