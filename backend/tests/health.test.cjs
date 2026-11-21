require('dotenv/config');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { AppModule } = require('../dist/src/app.module');
const { configure } = require('../dist/src/http/setup');

const suite = process.env.NUVEX_INTEGRATION === '1' ? describe : describe.skip;
suite('Estado profundo', () => {
  let app, server;
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configure(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
  });
  afterAll(async () => { if (app) await app.close(); });

  test('reporta base de datos, redis y almacenamiento', async () => {
    const res = await request(server).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toEqual({ database: 'ok', redis: 'ok', storage: 'ok' });
  });
});
