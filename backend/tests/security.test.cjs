const { importUrl, extractUrls, publicIp } = require('../dist/src/imports/import-urls');
const { digest, seal, unseal, secretHash } = require('../dist/src/common/security');
const { cleanName } = require('../dist/src/files/file-entry');
const { sendAlert } = require('../dist/src/worker/alerts');

beforeAll(() => {
  process.env.NUVEX_SECRET ||= Buffer.alloc(32, 9).toString('base64');
});

test('filtros de importación y deduplicación', () => {
  expect(extractUrls({ file: ['https://example.com/foto.png#x', { url: 'https://example.com/foto.png#y' }, 'file:///private'] }))
    .toEqual(['https://example.com/foto.png']);
  expect(importUrl('http://127.0.0.1/a')).toBeNull();
  expect(importUrl('http://[::ffff:127.0.0.1]/a')).toBeNull();
  expect(importUrl('https://name:pass@example.com/image.jpg')).toBeNull();
  expect(publicIp('169.254.10.2')).toBe(false);
  expect(publicIp('8.8.8.8')).toBe(true);
});

test('cifrado autenticado y hashes por contexto', () => {
  const ciphertext = seal('clave privada');
  expect(unseal(ciphertext)).toBe('clave privada');
  expect(ciphertext).not.toBe(seal('clave privada'));
  expect(secretHash('guest', 'ABC')).not.toBe(secretHash('owner', 'ABC'));
  expect(digest('abc')).toHaveLength(64);
  const changed = Buffer.from(ciphertext, 'base64url');
  changed[12] ^= 1;
  expect(() => unseal(changed.toString('base64url'))).toThrow();
});

test('normaliza nombres y protege la estructura lógica de carpetas', () => {
  expect(cleanName(' Café.jpg ')).toBe('Café.jpg');
  expect(() => cleanName('../archivo')).toThrow();
  expect(() => cleanName('a\u0000b')).toThrow();
});

test('un rechazo de Resend conserva un error recuperable y una clave de idempotencia', async () => {
  const transport = jest.fn(async () => new Response(null, { status: 503 }));
  await expect(sendAlert({
    key: 'fake', from: 'drive@example.com', to: 'owner@example.com',
    idempotencyKey: 'backup-2026-11-20', message: 'Respaldo pendiente.',
  }, transport)).rejects.toThrow('Resend');
  expect(transport.mock.calls[0][1].headers['Idempotency-Key']).toBe('backup-2026-11-20');
});
