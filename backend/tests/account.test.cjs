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
suite('Gestion de cuenta del propietario', () => {
  let app, database, server, client, owner;
  const username = ('acct-' + randomUUID()).slice(0, 30);
  let password = 'cuenta password 123456';
  const prefix = '/api/v1';
  const write = (agent, method, path) => agent[method](prefix + path).set('X-Nuvex-Request', '1');
  const codeFor = (secret) => new TOTP({ secret: Secret.fromBase32(secret) }).generate();

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

  test('cambia contrasena, regenera codigos, re-enrola y desactiva 2FA', async () => {
    const login = await write(client, 'post', '/auth/login').send({ username, password }).expect(200);
    const enrollment = await write(client, 'post', '/auth/totp').send({ code: codeFor(login.body.setupKey) }).expect(200);
    expect(enrollment.body.recoveryCodes).toHaveLength(10);
    const oldRecovery = enrollment.body.recoveryCodes[0];
    await client.get(prefix + '/auth/me').expect(200);

    await write(client, 'post', '/auth/password').send({ currentPassword: 'incorrecta', newPassword: 'otra password 123456' }).expect(401);
    await write(client, 'post', '/auth/password').send({ currentPassword: password, newPassword: 'otra password 123456' }).expect(204);
    password = 'otra password 123456';
    await client.get(prefix + '/auth/me').expect(200);
    await write(request.agent(server), 'post', '/auth/login').send({ username, password: 'cuenta password 123456' }).expect(401);
    const relogin = await write(request.agent(server), 'post', '/auth/login').send({ username, password }).expect(200);
    expect(relogin.body.stage).toBe('verify');

    const regen = await write(client, 'post', '/auth/recovery/regenerate').send({ currentPassword: password }).expect(200);
    expect(regen.body.recoveryCodes).toHaveLength(10);
    const stale = request.agent(server);
    await write(stale, 'post', '/auth/login').send({ username, password }).expect(200);
    await write(stale, 'post', '/auth/recovery').send({ code: oldRecovery }).expect(401);

    const begin = await write(client, 'post', '/auth/totp/enroll').send({ currentPassword: password }).expect(200);
    expect(begin.body.setupKey).toBeTruthy();
    expect(begin.body.qr).toMatch(/^data:image\/png;base64,/);
    const confirm = await write(client, 'post', '/auth/totp/confirm').send({ code: codeFor(begin.body.setupKey) }).expect(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    await client.get(prefix + '/auth/me').expect(200);

    await write(client, 'post', '/auth/2fa/disable').send({ currentPassword: password, code: '000000' }).expect(401);
    await write(client, 'post', '/auth/2fa/disable').send({ currentPassword: password, code: codeFor(begin.body.setupKey) }).expect(204);
    const afterDisable = await write(request.agent(server), 'post', '/auth/login').send({ username, password }).expect(200);
    expect(afterDisable.body.stage).toBe('enroll');
  });

  test('cierra todas las sesiones salvo la actual', async () => {
    // Tras el test anterior, 2FA quedó desactivada: el login vuelve a pedir enrolamiento.
    const other = request.agent(server);
    const login = await write(other, 'post', '/auth/login').send({ username, password }).expect(200);
    expect(login.body.stage).toBe('enroll');
    const enrolled = await write(other, 'post', '/auth/totp').send({ code: codeFor(login.body.setupKey) }).expect(200);
    await other.get(prefix + '/auth/me').expect(200);

    const session = request.agent(server);
    const second = await write(session, 'post', '/auth/login').send({ username, password }).expect(200);
    expect(second.body.stage).toBe('verify');
    await write(session, 'post', '/auth/recovery').send({ code: enrolled.body.recoveryCodes[0] }).expect(200);
    await session.get(prefix + '/auth/me').expect(200);

    const revoked = await write(session, 'post', '/auth/sessions/revoke-all').send({}).expect(200);
    expect(revoked.body.revoked).toBeGreaterThanOrEqual(1);
    await other.get(prefix + '/auth/me').expect(401);
    await session.get(prefix + '/auth/me').expect(200);
  });
});
