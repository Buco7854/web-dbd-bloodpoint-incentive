import type { ComponentType } from 'react';
import type { Role } from '@shared/types';
import { SkullIcon, SurvivorIcon } from '../components/icons';
import type { Messages } from '../i18n/types';

export type ActiveKey = Role | 'none';

export interface RoleMeta {
  labelKey: keyof Messages;
  Icon: ComponentType<{ className?: string }>;
  accent: string;
  /** Background + ring colour when this role carries the bonus. */
  emphasis: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  survivor: {
    labelKey: 'roleSurvivor',
    Icon: SurvivorIcon,
    accent: 'text-survivor',
    emphasis: 'bg-survivor/10 ring-survivor/40',
  },
  killer: {
    labelKey: 'roleKiller',
    Icon: SkullIcon,
    accent: 'text-blood-400',
    emphasis: 'bg-blood-600/10 ring-blood-500/40',
  },
};

/** Card / hero gradient + border, keyed by which role carries the bonus. */
export const CARD_GRADIENT: Record<ActiveKey, string> = {
  killer: 'from-blood-900/55 via-void-700 to-void-800 border-blood-800/50',
  survivor: 'from-survivor/10 via-void-700 to-void-800 border-survivor/25',
  none: 'from-void-600/40 via-void-700 to-void-800 border-white/10',
};

export const HEADLINE_COLOR: Record<ActiveKey, string> = {
  killer: 'text-blood-400',
  survivor: 'text-survivor',
  none: 'text-bone-300',
};

/** Line colours for the history chart, matching the survivor/killer role accents. */
export const SERIES_COLOR: Record<Role, string> = {
  survivor: '#36c2a6',
  killer: '#e01e2b',
};

/** Lighter per-role tints for the forecast (predicted) lines + band, so the prediction
 *  reads as a paler projection of each role rather than live data. */
export const FORECAST_COLOR: Record<Role, string> = {
  survivor: '#b6ece0',
  killer: '#f7bcc0',
};
