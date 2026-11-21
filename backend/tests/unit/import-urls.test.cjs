const { importUrl, publicIp, extractUrls } = require('../../dist/src/imports/import-urls');

test('acepta enlaces publicos https', () => {
  expect(importUrl('https://example.com/a.jpg')?.href).toBe('https://example.com/a.jpg');
});

test('rechaza destinos privados o inseguros', () => {
  expect(importUrl('http://127.0.0.1/x')).toBeNull();
  expect(importUrl('http://10.0.0.1/x')).toBeNull();
  expect(importUrl('file:///etc/passwd')).toBeNull();
  expect(importUrl('https://user:pass@example.com/x')).toBeNull();
  expect(importUrl('https://example.com:8080/x')).toBeNull();
  expect(importUrl('https://localhost/x')).toBeNull();
  expect(importUrl('x'.repeat(3000))).toBeNull();
});

test('extractUrls deduplica y tolera anidamiento', () => {
  const urls = extractUrls({
    a: 'https://example.com/a',
    b: ['https://example.com/a', { c: 'https://example.com/b' }, 'file:///x', 'http://127.0.0.1/y'],
  });
  expect(urls.sort()).toEqual(['https://example.com/a', 'https://example.com/b']);
});

test('publicIp distingue unicast de rangos privados', () => {
  expect(publicIp('8.8.8.8')).toBe(true);
  expect(publicIp('127.0.0.1')).toBe(false);
  expect(publicIp('10.1.2.3')).toBe(false);
  expect(publicIp('no-es-ip')).toBe(false);
});
