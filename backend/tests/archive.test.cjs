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
suite('Descarga de carpeta en ZIP', () => {
  let app, database, server, client, owner;
  const username = ('zip-' + randomUUID()).slice(0, 30);
  const password = 'zip password 123456';
  const prefix = '/api/v1';
  const write = (agent, method, path) => agent[method](prefix + path).set('X-Nuvex-Request', '1');
  const readBinary = (path) => client.get(prefix + path).buffer(true).parse((res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });

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
      await database.audit.deleteMany({ where: { ownerId: owner.id } });
      await database.session.deleteMany({ where: { ownerId: owner.id } });
      await database.entry.deleteMany({ where: { ownerId: owner.id } });
      await database.owner.delete({ where: { id: owner.id } });
    }
    await database?.$disconnect();
    if (app) await app.close();
  });

  test('empaqueta el contenido de una carpeta', async () => {
    const folder = await write(client, 'post', '/folders').send({ name: 'Zip', parentId: '' }).expect(201);
    const bytes = Buffer.from('hola nuvex');
    const upload = await write(client, 'post', '/uploads').send({ name: 'nota.txt', mime: 'text/plain', size: bytes.length, parentId: folder.body.id, fingerprint: 'zip' }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(bytes).expect(204);
    await write(client, 'post', path + '/complete').send({}).expect(201);
    const archive = await readBinary('/entries/' + folder.body.id + '/archive').expect(200);
    expect(archive.headers['content-type']).toMatch(/application\/zip/);
    expect(archive.body.subarray(0, 2).toString()).toBe('PK');
  });

  test('rechaza archivar un archivo', async () => {
    const upload = await write(client, 'post', '/uploads').send({ name: 'uno.txt', mime: 'text/plain', size: 1, parentId: '', fingerprint: 'zip2' }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(Buffer.from('x')).expect(204);
    const entry = await write(client, 'post', path + '/complete').send({}).expect(201);
    await client.get(prefix + '/entries/' + entry.body.id + '/archive').expect(400);
  });
});
