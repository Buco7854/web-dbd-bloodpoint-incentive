import clsx from 'clsx';
import { useI18n } from '../i18n';

interface Props {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}

/** Windowed numeric pagination. Renders nothing for a single page. */
export function Pagination({ page, pageCount, onPage }: Props) {
  const { t } = useI18n();
  if (pageCount <= 1) return null;

  const window = 1;
  const pages: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= window) pages.push(i);
  }

  const buttonBase =
    'min-w-9 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40';

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        className={clsx(buttonBase, 'text-bone-300 hover:bg-void-600/60 disabled:hover:bg-transparent')}
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
      >
        {t('paginationPrev')}
      </button>
      {pages.map((p, i) => {
        const gap = i > 0 && p - (pages[i - 1] ?? p) > 1;
        return (
          <span key={p} className="flex items-center gap-1.5">
            {gap && <span className="px-1 text-bone-600">…</span>}
            <button
              type="button"
              aria-current={p === page ? 'page' : undefined}
              className={clsx(
                buttonBase,
                p === page
                  ? 'bg-blood-600/90 text-white shadow-glow-soft'
                  : 'text-bone-300 hover:bg-void-600/60',
              )}
              onClick={() => onPage(p)}
            >
              {p + 1}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className={clsx(buttonBase, 'text-bone-300 hover:bg-void-600/60 disabled:hover:bg-transparent')}
        onClick={() => onPage(page + 1)}
        disabled={page === pageCount - 1}
      >
        {t('paginationNext')}
      </button>
    </nav>
  );
}
