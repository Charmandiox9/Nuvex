require('dotenv/config');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { inflateRawSync } = require('node:zlib');
const sharp = require('sharp');
const { hash } = require('@node-rs/argon2');
const { Secret, TOTP } = require('otpauth');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { createDatabase } = require('../dist/prisma/client');
const { AppModule } = require('../dist/src/app.module');
const { configure, contract } = require('../dist/src/http/setup');
const { Storage } = require('../dist/src/storage/storage');

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('REST y PostgreSQL con almacenamiento real', () => {
  let app, database, server, client, owner, worker;
  const username = ('test-' + randomUUID()).slice(0, 30);
  const password = 'test password 123456789';
  const prefix = '/api/v1';
  const write = (agent, method, path) => agent[method](prefix + path).set('X-Nuvex-Request', '1');
  const put = async (name, mime, bytes, parentId = '') => {
    const upload = await write(client, 'post', '/uploads').send({
      name, mime, size: bytes.length, parentId, fingerprint: name,
    }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(bytes).expect(204);
    return (await write(client, 'post', path + '/complete').send({}).expect(201)).body;
  };
  const awaitState = async (id) => {
    for (let count = 0; count < 50; count++) {
      const row = await database.entry.findUniqueOrThrow({ where: { id } });
      if (['ready', 'failed', 'needs-transcode'].includes(row.mediaStatus)) return row;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('El worker no publicó el medio.');
  };

  beforeAll(async () => {
    database = createDatabase();
    owner = await database.owner.create({ data: { username, passwordHash: await hash(password) } });
    app = await NestFactory.create(AppModule, { logger: false });
    configure(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    client = request.agent(server);
    worker = spawn(process.execPath, ['dist/src/worker/main.js'], { stdio: ['ignore', 'ignore', 'inherit'] });
  });

  afterAll(async () => {
    if (worker && worker.exitCode === null) {
      const stopped = once(worker, 'exit');
      worker.kill();
      await stopped;
    }
    if (app) await app.close();
    if (database && owner) {
      const storage = new Storage();
      const entries = await database.entry.findMany({ where: { ownerId: owner.id } });
      const keys = new Set(entries.flatMap((row) => [row.objectKey, row.previewKey, row.posterKey, row.videoKey]).filter(Boolean));
      await Promise.allSettled([...keys].map((key) => storage.delete(key)));
      const shares = await database.share.findMany({ where: { ownerId: owner.id }, select: { id: true } });
      const guest = await database.guestSession.findMany({ where: { shareId: { in: shares.map((row) => row.id) } } });
      await Promise.allSettled(guest.map((session) => storage.deletePrefix('guest/' + session.id + '/')));
      await database.guestSession.deleteMany({ where: { id: { in: guest.map((row) => row.id) } } });
      await database.share.deleteMany({ where: { ownerId: owner.id } });
      await database.audit.deleteMany({ where: { ownerId: owner.id } });
      await database.importItem.deleteMany({ where: { ownerId: owner.id } });
      await database.upload.deleteMany({ where: { ownerId: owner.id } });
      await database.entry.deleteMany({ where: { ownerId: owner.id } });
      await database.session.deleteMany({ where: { ownerId: owner.id } });
      await database.owner.delete({ where: { id: owner.id } });
    }
    await database?.$disconnect();
  });

  test('verifica TOTP y recuperación, reanuda bloques y limita canjes concurrentes', async () => {
    const schema = contract(app);
    expect(schema.paths[prefix + '/uploads/{id}/parts/{number}']).toBeDefined();
    await client.post(prefix + '/auth/login').send({ username, password }).expect(403);
    const login = await write(client, 'post', '/auth/login').send({ username, password }).expect(200);
    expect(login.body.stage).toBe('enroll');
    await client.get(prefix + '/auth/me').expect(401);
    const code = new TOTP({ secret: Secret.fromBase32(login.body.setupKey) }).generate();
    const enrollment = await write(client, 'post', '/auth/totp').send({ code }).expect(200);
    expect(enrollment.body.recoveryCodes).toHaveLength(10);
    await client.get(prefix + '/auth/me').expect(200);

    const other = request.agent(server);
    const recovered = enrollment.body.recoveryCodes[0];
    await write(other, 'post', '/auth/login').send({ username, password }).expect(200);
    await write(other, 'post', '/auth/recovery').send({ code: recovered }).expect(200);
    const third = request.agent(server);
    await write(third, 'post', '/auth/login').send({ username, password }).expect(200);
    await write(third, 'post', '/auth/recovery').send({ code: recovered }).expect(401);
    const sessions = await client.get(prefix + '/auth/sessions').expect(200);
    await write(client, 'delete', '/auth/sessions/' + sessions.body.find((session) => !session.current).id).expect(204);
    await other.get(prefix + '/auth/me').expect(401);

    const folder = await write(client, 'post', '/folders').send({ name: 'Fotos', parentId: '' }).expect(201);
    const firstBlock = Buffer.alloc(8 * 1024 ** 2, 41);
    const large = process.env.NUVEX_LARGE_TEST === '1';
    const partCount = large ? 128 : 2;
    const lastBlock = large ? Buffer.alloc(firstBlock.length, 42) : Buffer.from('resto');
    const total = (partCount - 1) * firstBlock.length + lastBlock.length;
    const upload = await write(client, 'post', '/uploads').send({
      name: 'prueba.bin', mime: 'application/octet-stream', size: total,
      parentId: folder.body.id, fingerprint: 'fixture',
    }).expect(201);
    const path = '/uploads/' + upload.body.id;
    await write(client, 'put', path + '/parts/1').set('Content-Type', 'application/octet-stream').send(firstBlock).expect(204);
    const partial = await client.get(prefix + path).expect(200);
    expect(partial.body.parts.map((part) => part.PartNumber)).toEqual([1]);
    await write(client, 'post', path + '/complete').send({}).expect(409);
    for (let index = 2; index <= partCount; index++) {
      await write(client, 'put', path + '/parts/' + index).set('Content-Type', 'application/octet-stream')
        .send(index === partCount ? lastBlock : firstBlock).expect(204);
    }
    const entry = await write(client, 'post', path + '/complete').send({}).expect(201);
    const read = '/entries/' + entry.body.id + '/content';
    const lastRange = 'bytes=' + (total - lastBlock.length) + '-' + (total - lastBlock.length + 4);
    const response = await client.get(prefix + read).set('Range', lastRange).expect(206);
    expect(response.body).toEqual(lastBlock.subarray(0, 5));
    if (large) {
      const expected = createHash('sha256');
      for (let index = 1; index < partCount; index++) expected.update(firstBlock);
      expected.update(lastBlock);
      const address = server.address();
      const cookie = enrollment.headers['set-cookie'][0].split(';')[0];
      const download = await fetch('http://127.0.0.1:' + address.port + prefix + read, { headers: { cookie } });
      expect(download.status).toBe(200);
      const actual = createHash('sha256');
      for await (const chunk of download.body) actual.update(chunk);
      expect(actual.digest('hex')).toBe(expected.digest('hex'));
    }

    for (const uses of [1, 2]) {
      const link = await write(client, 'post', '/shares').send({ entryId: folder.body.id, uses }).expect(201);
      const guestPath = '/guest/' + link.body.id;
      const guests = [request.agent(server), request.agent(server), request.agent(server)];
      const attempts = await Promise.all(guests.map((guest) => write(guest, 'post', guestPath + '/redeem').send({ code: link.body.code })));
      expect(attempts.filter((attempt) => attempt.status === 200)).toHaveLength(uses);
      const permitted = guests[attempts.findIndex((attempt) => attempt.status === 200)];
      await permitted.get(prefix + guestPath).expect(200);
      await permitted.get(prefix + guestPath + '/content/' + entry.body.id + '?mode=download').expect(403);
      await write(client, 'delete', '/shares/' + link.body.id).expect(204);
      await permitted.get(prefix + guestPath).expect(403);
    }

    await write(client, 'delete', '/entries/' + entry.body.id).expect(204);
    await client.get(prefix + read).expect(404);
    await write(client, 'post', '/entries/' + entry.body.id + '/restore').send({}).expect(201);
    await client.get(prefix + read).set('Range', lastRange).expect(206);
  }, 240_000);

  test('genera derivados, transmite video por rangos y prepara marcas de sesión', async () => {
    const pixels = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#9080af' } }).png().toBuffer();
    const image = await put('muestra.png', 'image/png', pixels);
    expect((await awaitState(image.id)).mediaStatus).toBe('ready');
    const copy = await write(client, 'post', '/entries/' + image.id + '/copy').send({ name: 'copia.png' }).expect(201);
    const folder = await write(client, 'post', '/folders').send({ name: 'Destino' }).expect(201);
    const moved = await write(client, 'patch', '/entries/' + copy.body.id)
      .send({ name: 'movida.png', parentId: folder.body.id }).expect(200);
    expect(moved.body.parentId).toBe(folder.body.id);
    await client.get(prefix + '/entries/' + copy.body.id + '/content?mode=download').expect(200);
    const link = await write(client, 'post', '/shares').send({ entryId: image.id }).expect(201);
    const path = '/guest/' + link.body.id;
    const guest = request.agent(server);
    await write(guest, 'post', path + '/redeem').send({ code: link.body.code }).expect(200);
    let ready = false;
    for (let count = 0; count < 35 && !ready; count++) {
      const response = await write(guest, 'post', path + '/preview/' + image.id).expect(202);
      ready = response.body.ready;
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    expect(ready).toBe(true);
    await guest.get(prefix + path + '/content/' + image.id).expect('Content-Type', 'image/webp').expect(200);
    const video = execFileSync('ffmpeg', [
      '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=128x72:d=1',
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-threads', '1', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', '-',
    ]);
    const entry = await put('muestra.mp4', 'video/mp4', video);
    expect((await awaitState(entry.id)).mediaStatus).toBe('ready');
    await client.get(prefix + '/entries/' + entry.id + '/content?mode=preview')
      .set('Range', 'bytes=0-127').expect('Content-Type', 'video/mp4').expect('Content-Range', /^bytes 0-127\//).expect(206);
  });

  test('almacena un JPEG más pequeño y descarga el original con metadatos intactos', async () => {
    const folder = await write(client, 'post', '/folders').send({ name: 'JPEG' }).expect(201);
    const jpeg = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#9080af' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const entry = await put('original.jpg', 'image/jpeg', jpeg, folder.body.id);
    const row = await awaitState(entry.id);
    expect(row.mediaStatus).toBe('ready');
    const storage = new Storage();
    const head = await storage.head(row.objectKey);
    expect(head.ContentLength).toBeLessThan(jpeg.length);
    expect(head.Metadata['nuvex-jpeg-sha256']).toBe(createHash('sha256').update(jpeg).digest('hex'));

    const path = prefix + '/entries/' + entry.id + '/content';
    await client.get(path + '?mode=preview').expect('Content-Type', 'image/webp').expect(200);
    const download = await client.get(path + '?mode=download').expect('Content-Length', String(jpeg.length)).expect(200);
    expect(download.body).toEqual(jpeg);
    const range = await client.get(path).set('Range', 'bytes=-15')
      .expect('Content-Range', `bytes ${jpeg.length - 15}-${jpeg.length - 1}/${jpeg.length}`).expect(206);
    expect(range.body).toEqual(jpeg.subarray(-15));
    await client.get(path).set('Range', `bytes=${jpeg.length}-`).expect(416);

    const share = await write(client, 'post', '/shares').send({ entryId: entry.id, allowDownload: true }).expect(201);
    const guest = request.agent(server);
    const guestPath = '/guest/' + share.body.id;
    await write(guest, 'post', guestPath + '/redeem').send({ code: share.body.code }).expect(200);
    expect((await guest.get(prefix + guestPath + '/content/' + entry.id + '?mode=download').expect(200)).body).toEqual(jpeg);

    const zip = await client.get(prefix + '/entries/' + folder.body.id + '/archive').buffer(true).parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    const directory = zip.body.readUInt32LE(zip.body.length - 6);
    const fileSize = zip.body.readUInt32LE(directory + 20);
    const fileOffset = 30 + zip.body.readUInt16LE(26) + zip.body.readUInt16LE(28);
    expect(inflateRawSync(zip.body.subarray(fileOffset, fileOffset + fileSize))).toEqual(jpeg);

    const copy = await write(client, 'post', '/entries/' + entry.id + '/copy').send({ name: 'copia.jpg' }).expect(201);
    expect((await awaitState(copy.body.id)).mediaStatus).toBe('ready');
    expect((await client.get(prefix + '/entries/' + copy.body.id + '/content').expect(200)).body).toEqual(jpeg);
  });

  test('revisa JSON y exige enlaces directos válidos en cada lote', async () => {
    const url = 'https://example.com/foto.jpg';
    const review = await write(client, 'post', '/imports/inspect').send({
      json: { url, next: [{ url }, 'http://127.0.0.1/archivo', 'file:///foto.jpg'] },
    }).expect(201);
    expect(review.body.urls).toEqual([url]);
    await write(client, 'post', '/imports').send({ items: [{ url: 'http://127.0.0.1/archivo' }] }).expect(400);
  });

  const remoteFixture = process.env.NUVEX_IMPORT_TEST_URL;
  (remoteFixture ? test : test.skip)('descarga un enlace confirmado y deduplica el lote', async () => {
    const started = await write(client, 'post', '/imports').send({
      items: [{ url: remoteFixture, name: 'fixture-remota.txt' }, { url: remoteFixture, name: 'fixture-remota.txt' }],
    }).expect(201);
    let item;
    for (let attempt = 0; attempt < 50; attempt++) {
      const rows = await database.importItem.findMany({ where: { batchId: started.body.batchId } });
      expect(rows).toHaveLength(1);
      item = rows[0];
      if (['completed', 'failed'].includes(item.state)) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(item?.state).toBe('completed');
    await client.get(prefix + '/entries/' + item.entryId + '/content').expect(200);
  });
});
