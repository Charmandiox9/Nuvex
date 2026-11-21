const { mediaKind, cleanName, serializeEntry } = require('../../dist/src/files/file-entry');

test('mediaKind reconoce imagenes y video', () => {
  expect(mediaKind('image/png')).toBe(true);
  expect(mediaKind('image/jpeg')).toBe(true);
  expect(mediaKind('video/mp4')).toBe(true);
  expect(mediaKind('audio/mpeg')).toBe(false);
  expect(mediaKind('text/plain')).toBe(false);
});

test('cleanName recorta y valida', () => {
  expect(cleanName('  foto.jpg  ')).toBe('foto.jpg');
  expect(() => cleanName('')).toThrow();
  expect(() => cleanName('a/b')).toThrow();
  expect(() => cleanName('a\\b')).toThrow();
  expect(() => cleanName('..')).toThrow();
  expect(() => cleanName('x'.repeat(201))).toThrow();
});

test('serializeEntry convierte bigint y fechas', () => {
  const row = {
    id: '1', parentId: '', name: 'f', kind: 'file', mime: 'text/plain', size: 5n,
    mediaStatus: 'none', updatedAt: new Date('2020-01-01T00:00:00Z'), trashedAt: null,
    previewKey: null, videoKey: null, posterKey: null,
  };
  const out = serializeEntry(row);
  expect(out.size).toBe('5');
  expect(out.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  expect(out.trashedAt).toBeUndefined();
  expect(out.hasPreview).toBe(false);
});
