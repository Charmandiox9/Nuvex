require('dotenv/config');
const { randomUUID } = require('node:crypto');
const { hash } = require('@node-rs/argon2');
const { Secret, TOTP } = require('otpauth');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { createDatabase } = require('../dist/prisma/client');
const { AppModule } = require('../dist/src/app.module');
const { configure } = require('../dist/src/http/setup');
const { Storage } = require('../dist/src/storage/storage');

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('Enlaces compartidos: QR y envio', () => {
  let app, database, server, client, owner;
  const username = ('share-' + randomUUID()).slice(0, 30);
  const password = 'share password 123456';
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
      const storage = new Storage();
      const entries = await database.entry.findMany({ where: { ownerId: owner.id } });
      await Promise.allSettled(entries.flatMap((row) => row.objectKey ? [storage.delete(row.objectKey)] : []));
      const shares = await database.share.findMany({ where: { ownerId: owner.id }, select: { id: true } });
      await database.guestSession.deleteMany({ where: { shareId: { in: shares.map((row) => row.id) } } });
      await database.share.deleteMany({ where: { ownerId: owner.id } });
      await database.audit.deleteMany({ where: { ownerId: owner.id } });
      await database.session.deleteMany({ where: { ownerId: owner.id } });
      await database.entry.deleteMany({ where: { ownerId: owner.id } });
      await database.owner.delete({ where: { id: owner.id } });
    }
    await database?.$disconnect();
    if (app) await app.close();
  });

  test('incluye QR en la creacion y valida el envio', async () => {
    const bytes = Buffer.from('documento');
    const upload = await write(client, 'post', '/uploads').send({ name: 'documento.txt', mime: 'text/plain', size: bytes.length, parentId: '', fingerprint: 'share' }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(bytes).expect(204);
    const entry = await write(client, 'post', path + '/complete').send({}).expect(201);

    const share = await write(client, 'post', '/shares').send({ entryId: entry.body.id, uses: 2 }).expect(201);
    expect(share.body.path).toBe('/s/' + share.body.id);
    expect(share.body.qr).toMatch(/^data:image\/png;base64,/);

    await write(client, 'post', '/shares/' + share.body.id + '/send').send({ to: 'alguien@ejemplo.com', code: 'ZZZZZZ' }).expect(403);

    if (!process.env.RESEND_API_KEY || !process.env.NUVEX_ALERT_FROM) {
      await write(client, 'post', '/shares/' + share.body.id + '/send').send({ to: 'alguien@ejemplo.com', code: share.body.code }).expect(503);
    }
  });
});
