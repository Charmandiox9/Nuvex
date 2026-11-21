import { expect, test } from 'vitest';
import { drivePath, driveRouteFromPathname } from './routes';

test('reconoce la raíz, las secciones y las carpetas por id', () => {
  const id = '5b70c000-8611-4ff3-9241-b251312c0bd7';
  expect(driveRouteFromPathname('/drive')).toEqual({ view: 'files' });
  expect(driveRouteFromPathname('/drive/storage/')).toEqual({ view: 'storage' });
  expect(driveRouteFromPathname('/drive/%67allery')).toEqual({ view: 'gallery' });
  expect(driveRouteFromPathname(drivePath('files', id))).toEqual({ view: 'files', folderId: id });
});

test.each(['https://example.test/drive', '//drive/storage', '/drive//storage', '/drive/%', '/drive/unknown', '/drive/folders/missing'])(
  'rechaza destinos fuera de las rutas de Drive (%s)',
  (path) => expect(driveRouteFromPathname(path)).toBeNull(),
);
