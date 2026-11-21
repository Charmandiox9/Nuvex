'use client';

import { useI18n } from '@/i18n/provider';
import type { Locale } from '@/i18n/catalogs';

export const languageOptions: { id: Locale; label: string; short: string }[] = [
  { id: 'es', label: 'Español', short: 'ES' },
  { id: 'en', label: 'English', short: 'EN' },
];

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <div className="theme-toggle" role="group" aria-label={t('panel.languageAria')}>
    {languageOptions.map(({ id, label, short }) => (
      <button key={id} type="button" className={'secondary' + (locale === id ? ' theme-active' : '')}
        aria-pressed={locale === id} aria-label={label} title={label} onClick={() => setLocale(id)}>
        {compact ? short : label}
      </button>
    ))}
  </div>;
}
