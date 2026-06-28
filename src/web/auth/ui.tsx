import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from '../components/icons';

/** Centered card shell used by the setup and login screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-void-800/80 p-6 shadow-card">
        <h1 className="font-display text-2xl font-bold tracking-wide text-bone-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-bone-400">{subtitle}</p>}
        <div className="mt-5 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm text-bone-300">
      {label}
      <input
        {...props}
        className="rounded-xl border border-white/10 bg-void-700/70 px-3 py-2 text-sm text-bone-100 outline-none transition placeholder:text-bone-500 focus:border-blood-600/50 focus:ring-2 focus:ring-blood-600/20"
      />
    </label>
  );
}

export function Button({
  variant = 'primary',
  ...props
}: { variant?: 'primary' | 'ghost' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-blood-600/90 text-bone-50 shadow-glow-soft hover:bg-blood-600'
          : 'border border-white/10 bg-void-700/70 text-bone-300 hover:border-white/20 hover:text-bone-100',
        props.className,
      )}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg border border-blood-700/50 bg-blood-900/30 px-3 py-2 text-sm text-blood-100">{children}</p>;
}

/** An on/off pill switch (used for enable/disable in tables). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-blood-600/80' : 'bg-void-600',
      )}
    >
      <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-bone-100 transition', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  /** Optional rich rendering (e.g. a flag + name); falls back to `label`. */
  node?: ReactNode;
}

/** Themed custom dropdown (same trigger + popover listbox as the language picker). */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = options.find((o) => o.value === value);

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const choose = (v: string): void => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-void-700/70 px-3 text-sm transition',
          open ? 'border-white/20 text-bone-100' : 'border-white/10 text-bone-200 hover:border-white/20 hover:text-bone-100',
        )}
      >
        <span className="truncate">{current?.node ?? current?.label ?? value}</span>
        <ChevronDownIcon className={clsx('h-4 w-4 shrink-0 text-bone-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
            className="z-50 overflow-hidden rounded-xl border border-white/10 bg-void-800 shadow-card"
          >
            <ul role="listbox" aria-label={ariaLabel} className="scroll-thin max-h-[50vh] space-y-0.5 overflow-auto p-1.5">
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => choose(o.value)}
                      className={clsx(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition',
                        active ? 'bg-white/5 text-bone-100' : 'text-bone-300 hover:bg-white/5 hover:text-bone-100',
                      )}
                    >
                      <span className="truncate">{o.node ?? o.label}</span>
                      {active && <CheckIcon className="h-4 w-4 shrink-0 text-blood-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Themed multi-select dropdown: pick any number of options; selected ones show a check. */
export function MultiSelect({
  values,
  options,
  onChange,
  ariaLabel,
  placeholder = 'None',
  className,
}: {
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (v: string): void =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const summary = options
    .filter((o) => values.includes(o.value))
    .map((o) => o.label)
    .join(', ');

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-void-700/70 px-3 text-sm transition',
          open ? 'border-white/20 text-bone-100' : 'border-white/10 text-bone-200 hover:border-white/20 hover:text-bone-100',
        )}
      >
        <span className={clsx('truncate', !summary && 'text-bone-500')}>{summary || placeholder}</span>
        <ChevronDownIcon className={clsx('h-4 w-4 shrink-0 text-bone-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-void-800 shadow-card">
          <ul role="listbox" aria-multiselectable="true" aria-label={ariaLabel} className="scroll-thin max-h-[50vh] space-y-0.5 overflow-auto p-1.5">
            {options.map((o) => {
              const active = values.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(o.value)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition',
                      active ? 'bg-white/5 text-bone-100' : 'text-bone-300 hover:bg-white/5 hover:text-bone-100',
                    )}
                  >
                    <span className="truncate">{o.label}</span>
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

/** Modal dialog over a dimmed backdrop; closes on Escape or backdrop click. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void-900/70 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-void-800 p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-bone-100">{title}</h3>
        <div className="mt-4 flex flex-col gap-4 text-sm text-bone-300">{children}</div>
      </div>
    </div>
  );
}
