require('dotenv/config');
const { randomUUID } = require('node:crypto');
const { hash } = require('@node-rs/argon2');
const { Secret, TOTP } = require('otpauth');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const sharp = require('sharp');
const { createDatabase } = require('../dist/prisma/client');
const { AppModule } = require('../dist/src/app.module');
const { configure } = require('../dist/src/http/setup');
const { Storage } = require('../dist/src/storage/storage');

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('Icono de carpeta', () => {
  let app, database, server, client, owner;
  const username = ('icon-' + randomUUID()).slice(0, 30);
  const password = 'icon password 123456';
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
      const keys = entries.flatMap((row) => [row.objectKey, row.iconKey]).filter((key) => Boolean(key));
      await Promise.allSettled(keys.map((key) => storage.delete(key)));
      await database.audit.deleteMany({ where: { ownerId: owner.id } });
      await database.session.deleteMany({ where: { ownerId: owner.id } });
      await database.entry.deleteMany({ where: { ownerId: owner.id } });
      await database.owner.delete({ where: { id: owner.id } });
    }
    await database?.$disconnect();
    if (app) await app.close();
  });

  test('sube, sirve y elimina el icono de una carpeta', async () => {
    const folder = await write(client, 'post', '/folders').send({ name: 'Con icono', parentId: '' }).expect(201);
    expect(folder.body.hasIcon).toBe(false);

    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#66aa88' } }).png().toBuffer();
    const uploaded = await write(client, 'post', '/entries/' + folder.body.id + '/icon')
      .set('Content-Type', 'application/octet-stream').send(png).expect(201);
    expect(uploaded.body.hasIcon).toBe(true);

    await client.get(prefix + '/entries/' + folder.body.id + '/content?mode=icon')
      .expect('Content-Type', /image\/webp/).expect(200);

    await write(client, 'delete', '/entries/' + folder.body.id + '/icon').expect(204);
    await client.get(prefix + '/entries/' + folder.body.id + '/content?mode=icon').expect(404);
  });
});
