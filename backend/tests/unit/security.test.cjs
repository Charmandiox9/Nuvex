process.env.NUVEX_SECRET = Buffer.alloc(32, 7).toString('base64');
const { digest, secretHash, seal, unseal, token } = require('../../dist/src/common/security');

test('digest es determinista y distingue entradas', () => {
  expect(digest('a')).toBe(digest('a'));
  expect(digest('a')).not.toBe(digest('b'));
});

test('secretHash depende del ambito', () => {
  expect(secretHash('share', 'abc')).toBe(secretHash('share', 'abc'));
  expect(secretHash('share', 'abc')).not.toBe(secretHash('recovery', 'abc'));
});

test('seal y unseal hacen ida y vuelta', () => {
  const sealed = seal('hola mundo');
  expect(sealed).not.toContain('hola mundo');
  expect(unseal(sealed)).toBe('hola mundo');
});

test('unseal rechaza contenido manipulado', () => {
  const sealed = seal('x');
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
  expect(() => unseal(tampered)).toThrow();
});

test('token es aleatorio', () => {
  expect(token()).not.toBe(token());
  expect(token(16).length).toBeGreaterThan(10);
});
