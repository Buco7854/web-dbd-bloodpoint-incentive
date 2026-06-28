import type { TFunc } from '../i18n';
import type { SelectOption } from './ui';

export const mfaRoleOptions = (t: TFunc): SelectOption[] => [
  { value: 'admin', label: t('adminRoleAdmins') },
  { value: 'user', label: t('adminRoleRegularUsers') },
];
