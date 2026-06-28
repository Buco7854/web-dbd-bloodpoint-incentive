import clsx from 'clsx';
import { useState } from 'react';
import type { LocateStatus } from '../hooks/useClosestRegion';
import { useI18n } from '../i18n';
import { Modal } from '../auth/ui';
import { CheckIcon, ChevronDownIcon, SpinnerIcon } from './icons';

interface Props {
  status: LocateStatus;
  onRetry: () => void;
  regions: { region: string; displayName: string }[];
  override: string | null;
  onOverride: (region: string | null) => void;
  detected: string | null;
  notCoveredName?: string | null;
}

export function RegionLocator({ status, onRetry, regions, override, onOverride, detected, notCoveredName }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = override ?? detected;
  const nameOf = (id: string | null): string | null =>
    id ? (regions.find((r) => r.region === id)?.displayName ?? id) : null;
  const triggerLabel = selected ? nameOf(selected) : status === 'detecting' ? t('locating') : t('regionOverrideAria');

  const choose = (id: string | null): void => {
    onOverride(id);
    setOpen(false);
  };

  return (
    <div className="mb-4 flex flex-col gap-1 text-xs text-bone-500">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-bone-400">
        <span>{t('yourRegion')}:</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 font-medium text-bone-200 underline decoration-bone-600 decoration-dotted underline-offset-2 transition hover:text-bone-100 hover:decoration-bone-400"
        >
          {status === 'detecting' && !selected && <SpinnerIcon className="h-3 w-3 animate-spin" />}
          {triggerLabel}
          <ChevronDownIcon className="h-3 w-3 text-bone-500" />
        </button>
      </div>
      {notCoveredName && <span className="text-bone-400">{t('regionNotCovered', { region: notCoveredName })}</span>}

      {open && (
        <Modal title={t('regionOverrideAria')} onClose={() => setOpen(false)}>
          <ul className="scroll-thin -mx-1 flex max-h-[55vh] flex-col gap-0.5 overflow-auto">
            <li>
              <RegionRow
                label={t('regionUseAuto')}
                sub={nameOf(detected) ?? undefined}
                active={override === null}
                onClick={() => choose(null)}
              />
            </li>
            {regions.map((r) => (
              <li key={r.region}>
                <RegionRow label={r.displayName} active={override === r.region} onClick={() => choose(r.region)} />
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                onOverride(null);
                onRetry();
                setOpen(false);
              }}
              className="text-xs text-bone-400 underline-offset-2 transition hover:text-bone-200 hover:underline"
            >
              {t('recheckRegion')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RegionRow({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
        active ? 'bg-white/5 text-bone-100' : 'text-bone-300 hover:bg-white/5 hover:text-bone-100',
      )}
    >
      <span>
        {label}
        {sub && <span className="ml-2 text-xs text-bone-500">{sub}</span>}
      </span>
      {active && <CheckIcon className="h-4 w-4 shrink-0 text-blood-400" />}
    </button>
  );
}
