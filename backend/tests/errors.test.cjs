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
suite('Codigos de error estables', () => {
  let app, database, server, client, owner;
  const username = ('codes-' + randomUUID()).slice(0, 30);
  const password = 'codes password 123456';
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

  test('expone codigos en respuestas de error', async () => {
    const wrong = await write(client, 'post', '/auth/login').send({ username, password: 'incorrecta' }).expect(401);
    expect(wrong.body.code).toBe('auth.invalidCredentials');

    const login = await write(client, 'post', '/auth/login').send({ username, password }).expect(200);
    await write(client, 'post', '/auth/totp').send({ code: new TOTP({ secret: Secret.fromBase32(login.body.setupKey) }).generate() }).expect(200);

    const missing = await client.get(prefix + '/entries/00000000-0000-0000-0000-000000000000/content').expect(404);
    expect(missing.body.code).toBe('files.notFound');

    const guest = await client.get(prefix + '/guest/cualquiera').expect(403);
    expect(guest.body.code).toBe('share.codeRequired');
  });
});
