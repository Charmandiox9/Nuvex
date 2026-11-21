import { describe, expect, test } from 'vitest';
import { formatBytes, message, setActiveLocale } from './format';

describe('formatBytes', () => {
  test('cero y unidades', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
  });

  test('decimales segun idioma', () => {
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(1536, 'es')).toBe('1,5 KB');
  });
});

describe('message', () => {
  test('traduce por codigo', () => {
    setActiveLocale('en');
    expect(message({ code: 'auth.invalidCredentials' })).toBe('Incorrect username or password.');
    setActiveLocale('es');
    expect(message({ code: 'files.notFound' })).toBe('Elemento no encontrado.');
  });

  test('usa el mensaje como respaldo', () => {
    expect(message(new Error('boom'))).toBe('boom');
  });

  test('codigo desconocido cae al inesperado', () => {
    setActiveLocale('es');
    expect(message({ code: 'no.existe' })).toBe('Ocurrió un error inesperado.');
  });
});
