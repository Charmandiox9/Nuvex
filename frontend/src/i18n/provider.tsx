'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { messages, type Locale } from './catalogs';
import { setActiveLocale } from '@/lib/format';

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

type I18nValue = { locale: Locale; setLocale: (locale: Locale) => void; t: TFunction };

const I18nContext = createContext<I18nValue | null>(null);

const readLocale = (): Locale => {
  if (typeof localStorage === 'undefined') return 'es';
  return localStorage.getItem('nuvex-locale') === 'en' ? 'en' : 'es';
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es');

  useEffect(() => {
    setLocaleState(readLocale());
  }, []);

  useEffect(() => {
    setActiveLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('nuvex-locale', next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback<TFunction>((key, vars) => {
    const catalog = messages[locale] as Record<string, string>;
    const fallback = messages.es as Record<string, string>;
    let template = catalog[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        template = template.split(`{${name}}`).join(String(value));
      }
    }
    return template;
  }, [locale]);

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n debe usarse dentro de I18nProvider');
  return value;
}
