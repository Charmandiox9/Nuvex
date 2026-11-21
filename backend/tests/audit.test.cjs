require('dotenv/config');
const { randomUUID } = require('node:crypto');
const { hash } = require('@node-rs/argon2');
const { Secret, TOTP } = require('otpauth');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { createDatabase } = require('../dist/prisma/client');
const { AppModule } = require('../dist/src/app.module');
const { configure } = require('../dist/src/http/setup');

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('Auditoria del propietario', () => {
  let app, database, server, client, owner;
  const username = ('audit-' + randomUUID()).slice(0, 30);
  const password = 'audit password 123456';
  const prefix = '/api/v1';
  const write = (agent, method, path) => agent[method](prefix + path).set('X-Nuvex-Request', '1');

  beforeAll(async () => {
    database = createDatabase();
    owner = await database.owner.create({ data: { username, passwordHash: await hash(password) } });
    app = await NestFactory.create(AppModule, { logger: false });
    configure(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    client = request.agent(server);
    const login = await write(client, 'post', '/auth/login').send({ username, password }).expect(200);
    await write(client, 'post', '/auth/totp').send({ code: new TOTP({ secret: Secret.fromBase32(login.body.setupKey) }).generate() }).expect(200);
  });

  afterAll(async () => {
    if (database && owner) {
      await database.audit.deleteMany({ where: { ownerId: owner.id } });
      await database.session.deleteMany({ where: { ownerId: owner.id } });
      await database.owner.delete({ where: { id: owner.id } });
    }
    await database?.$disconnect();
    if (app) await app.close();
  });

  test('lista la actividad reciente del propietario', async () => {
    await request.agent(server).get(prefix + '/audit').expect(401);
    const audit = await client.get(prefix + '/audit').expect(200);
    expect(Array.isArray(audit.body.items)).toBe(true);
    expect(audit.body.items.length).toBeGreaterThan(0);
    expect(audit.body.items[0].action).toBe('auth.verified');
    expect(typeof audit.body.items[0].createdAt).toBe('string');
    expect(audit.body.items[0].id).toBeTruthy();
  });
});
