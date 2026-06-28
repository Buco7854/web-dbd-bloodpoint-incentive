import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'blood' | 'amber' | 'survivor' | 'ok';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-void-600/70 text-bone-300 ring-white/10',
  blood: 'bg-blood-700/25 text-blood-200 ring-blood-600/40',
  amber: 'bg-ember-600/15 text-ember-400 ring-ember-500/30',
  survivor: 'bg-survivor/15 text-survivor ring-survivor/30',
  ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
};

interface Props {
  tone?: BadgeTone;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, title, children }: Props) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
