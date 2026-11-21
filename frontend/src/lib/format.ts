import type { Locale } from '@/i18n/catalogs';

export function formatBytes(input: string | number, locale: Locale = 'es') {
  const value = Number(input);
  if (!value) return '0 B';
  const power = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 ** power)
    + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][power];
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
