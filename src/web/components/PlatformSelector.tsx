import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { type BodyPlatform, getPlatformMeta } from '@shared/platforms';
import { useI18n } from '../i18n';
import { CheckIcon, ChevronDownIcon, LayersIcon } from './icons';

interface Props {
  platforms: BodyPlatform[];
  current: BodyPlatform;
  onChange: (p: BodyPlatform) => void;
}

const labelFor = (p: BodyPlatform): string => getPlatformMeta(p)?.label ?? p;

/** Themed dropdown to switch the platform whose incentives are shown. */
export function PlatformSelector({ platforms, current, onChange }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // With a single platform there is nothing to switch to: show a static badge.
  // Visibility is left to the container (desktop bar vs. the mobile drawer), so the
  // badge shows in both places rather than vanishing on mobile.
  if (platforms.length <= 1) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-void-700/70 px-2.5 text-sm text-bone-200">
        <LayersIcon className="h-4 w-4 text-bone-400" />
        {labelFor(current)}
      </span>
    );
  }

  const choose = (p: BodyPlatform): void => {
    onChange(p);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('platform')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'inline-flex h-9 items-center gap-2 rounded-xl border bg-void-700/70 pl-2.5 pr-2 text-sm transition',
          open
            ? 'border-white/20 text-bone-100'
            : 'border-white/10 text-bone-200 hover:border-white/20 hover:text-bone-100',
        )}
      >
        <LayersIcon className="h-4 w-4 text-bone-400" />
        <span className="max-w-[8.5rem] truncate">{labelFor(current)}</span>
        <ChevronDownIcon
          className={clsx('h-4 w-4 text-bone-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-void-800 shadow-card">
          <ul role="listbox" aria-label={t('platform')} className="space-y-0.5 p-1.5">
            {platforms.map((p) => {
              const active = p === current;
              return (
                <li key={p}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(p)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition',
                      active
                        ? 'bg-white/5 text-bone-100'
                        : 'text-bone-300 hover:bg-white/5 hover:text-bone-100 focus-visible:bg-white/5 focus-visible:text-bone-100',
                    )}
                  >
                    <span className="truncate">{labelFor(p)}</span>
                    {active && <CheckIcon className="h-4 w-4 shrink-0 text-blood-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
