import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { type Lang, LANGS, type Messages } from './types';
import en from './locales/en';
import fr from './locales/fr';
import de from './locales/de';
import es from './locales/es';
import esLA from './locales/es-LA';
import it from './locales/it';
import pl from './locales/pl';
import ptBR from './locales/pt-BR';
import ru from './locales/ru';
import ja from './locales/ja';
import ko from './locales/ko';
import zhHans from './locales/zh-Hans';
import zhHant from './locales/zh-Hant';
import th from './locales/th';
import tr from './locales/tr';

const MESSAGES: Record<Lang, Messages> = {
  en,
  fr,
  de,
  es,
  'es-LA': esLA,
  it,
  pl,
  'pt-BR': ptBR,
  ru,
  ja,
  ko,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  th,
  tr,
};

const STORAGE_KEY = 'dbd-bp-lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in MESSAGES) return saved as Lang;
  } catch {
    /* ignore */
  }
  const navLangs =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  const single = new Set(LANGS.map((l) => l.code));
  for (const raw of navLangs) {
    const lc = (raw || '').toLowerCase();
    if (!lc) continue;
    if (lc.startsWith('pt')) return 'pt-BR';
    if (lc.startsWith('zh')) return /tw|hk|mo|hant/.test(lc) ? 'zh-Hant' : 'zh-Hans';
    if (lc.startsWith('es')) return lc === 'es' || lc === 'es-es' ? 'es' : 'es-LA';
    const base = lc.split('-')[0] as Lang;
    if (single.has(base)) return base;
  }
  return 'en';
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export type TFunc = (key: keyof Messages, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, params) => interpolate(MESSAGES[lang][key] ?? en[key] ?? key, params),
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
