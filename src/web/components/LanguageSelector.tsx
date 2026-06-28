import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useI18n } from '../i18n';
import { type Lang, LANGS } from '../i18n/types';
import { CheckIcon, ChevronDownIcon, GlobeIcon } from './icons';

/** Themed custom language dropdown (trigger + popover listbox). */
export function LanguageSelector({ fullWidth = false }: { fullWidth?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const current = LANGS.find((l) => l.code === lang);

  // Close on outside click or Escape; move focus into the list when it opens.
  useEffect(() => {
    if (!open) return;
    // preventScroll so opening never jumps the page; reveal within the list only.
    activeRef.current?.focus({ preventScroll: true });
    activeRef.current?.scrollIntoView({ block: 'nearest' });
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

  const choose = (code: Lang): void => {
    setLang(code);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} className={clsx('relative', fullWidth && 'w-full')}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'h-9 items-center gap-2 rounded-xl border bg-void-700/70 pl-2.5 pr-2 text-sm transition',
          fullWidth ? 'flex w-full justify-between' : 'inline-flex',
          open
            ? 'border-white/20 text-bone-100'
            : 'border-white/10 text-bone-200 hover:border-white/20 hover:text-bone-100',
        )}
      >
        <span className="flex items-center gap-2">
          <GlobeIcon className="h-4 w-4 text-bone-400" />
          {fullWidth ? (
            <span>{t('language')}</span>
          ) : (
            <span className="hidden max-w-[8.5rem] truncate sm:inline">{current?.name ?? lang}</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {fullWidth && <span className="max-w-[8rem] truncate text-bone-400">{current?.name ?? lang}</span>}
          <ChevronDownIcon
            className={clsx('h-4 w-4 text-bone-500 transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {open && (
        <div
          className={clsx(
            'absolute z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-void-800 shadow-card',
            fullWidth ? 'left-0 right-0' : 'right-0 min-w-[12rem]',
          )}
        >
          <ul
            role="listbox"
            aria-label={t('language')}
            className="scroll-thin max-h-[60vh] space-y-0.5 overflow-auto p-1.5"
          >
            {LANGS.map((l) => {
              const active = l.code === lang;
              return (
                <li key={l.code}>
                  <button
                    ref={active ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(l.code)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition',
                      active
                        ? 'bg-white/5 text-bone-100'
                        : 'text-bone-300 hover:bg-white/5 hover:text-bone-100 focus-visible:bg-white/5 focus-visible:text-bone-100',
                    )}
                  >
                    <span className="truncate">{l.name}</span>
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
