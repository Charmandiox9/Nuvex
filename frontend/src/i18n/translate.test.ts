import { expect, test } from 'vitest';
import { interpolate } from './translate';

test('reemplaza variables', () => {
  expect(interpolate('Hola {name}, {n} archivos', { name: 'Ana', n: 3 })).toBe('Hola Ana, 3 archivos');
});

test('sin variables devuelve la plantilla', () => {
  expect(interpolate('Hola')).toBe('Hola');
});

test('deja marcadores desconocidos', () => {
  expect(interpolate('Hola {name}')).toBe('Hola {name}');
});
