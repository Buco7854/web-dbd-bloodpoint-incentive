import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useI18n } from '../i18n';
import { authApi } from './authApi';
import { Button, Field, Modal } from './ui';

export async function registerPasskey(label: string | null, csrf: string): Promise<void> {
  const { publicKey } = await authApi.passkeyRegisterOptions(csrf);
  const resp = await startRegistration({ optionsJSON: publicKey as PublicKeyCredentialCreationOptionsJSON });
  await authApi.passkeyRegisterVerify(resp, label, csrf);
}

export function PasskeyLabelModal({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (label: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    onSubmit(name.trim() || null);
  };
  return (
    <Modal title={t('accountPasskeyNameTitle')} onClose={() => { if (!busy) onClose(); }}>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field
          label={t('accountPasskeyNameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('accountPasskeyNamePlaceholder')}
          maxLength={64}
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-9 flex-1" disabled={busy}>
            {t('accountPasskeyCreate')}
          </Button>
          <Button type="button" variant="ghost" className="h-9 flex-1" disabled={busy} onClick={onClose}>
            {t('accountCancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
