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

const query = `query Q($view:String!,$parentId:String!,$search:String!,$sort:String!,$cursor:String,$kind:String,$mimePrefix:String,$minSize:String,$maxSize:String,$from:String,$to:String){
  entries(view:$view,parentId:$parentId,search:$search,sort:$sort,cursor:$cursor,kind:$kind,mimePrefix:$mimePrefix,minSize:$minSize,maxSize:$maxSize,from:$from,to:$to){items{id name kind mime size}}
}`;

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('Filtros de búsqueda en GraphQL', () => {
  let app, database, server, client, owner;
  const username = ('filter-' + randomUUID()).slice(0, 30);
  const password = 'filter password 123456';
  const prefix = '/api/v1';
  const write = (agent, method, path) => agent[method](prefix + path).set('X-Nuvex-Request', '1');
  const list = (variables) => client.post('/graphql').set('X-Nuvex-Request', '1').send({ query, variables });

  const put = async (name, mime, bytes, parentId = '') => {
    const upload = await write(client, 'post', '/uploads').send({ name, mime, size: bytes.length, parentId, fingerprint: name + bytes.length }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(bytes).expect(204);
    return (await write(client, 'post', path + '/complete').send({}).expect(201)).body;
  };

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

  test('filtra por tipo, MIME y tamaño', async () => {
    await write(client, 'post', '/folders').send({ name: 'Carpeta', parentId: '' }).expect(201);
    await put('foto.png', 'image/png', Buffer.from([1, 2, 3]));
    await put('nota.txt', 'text/plain', Buffer.from('hola!'));

    const folders = await list({ view: 'files', parentId: '', search: '', sort: 'name', kind: 'folder' });
    expect(folders.status).toBe(200);
    expect(folders.body.data.entries.items).toHaveLength(1);
    expect(folders.body.data.entries.items[0].kind).toBe('folder');

    const images = await list({ view: 'files', parentId: '', search: '', sort: 'name', mimePrefix: 'image/' });
    expect(images.body.data.entries.items).toHaveLength(1);
    expect(images.body.data.entries.items[0].name).toBe('foto.png');

    const large = await list({ view: 'files', parentId: '', search: '', sort: 'name', minSize: '4', kind: 'file' });
    expect(large.body.data.entries.items.map((item) => item.name)).toEqual(['nota.txt']);

    const small = await list({ view: 'files', parentId: '', search: '', sort: 'name', maxSize: '3', kind: 'file' });
    expect(small.body.data.entries.items.map((item) => item.name)).toEqual(['foto.png']);
  });

  test('rechaza filtros inválidos', async () => {
    const base = { view: 'files', parentId: '', search: '', sort: 'name' };
    const badSize = await list({ ...base, minSize: 'abc' });
    expect(badSize.status >= 400 || Boolean(badSize.body?.errors?.length)).toBe(true);
    const badKind = await list({ ...base, kind: 'weird' });
    expect(badKind.status >= 400 || Boolean(badKind.body?.errors?.length)).toBe(true);
  });
});
