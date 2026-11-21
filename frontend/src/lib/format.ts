import { messages, type Locale } from '@/i18n/catalogs';

export function formatBytes(input: string | number, locale: Locale = 'es') {
  const value = Number(input);
  if (!value) return '0 B';
  const power = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 ** power)
    + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][power];
}

let activeLocale: Locale = 'es';

export const setActiveLocale = (locale: Locale) => { activeLocale = locale; };

export function message(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const catalog = messages[activeLocale] as Record<string, string>;
  if (typeof code === 'string') {
    const text = catalog['error.' + code];
    if (text) return text;
  }
  return error instanceof Error ? error.message : catalog['error.unexpected'];
}
