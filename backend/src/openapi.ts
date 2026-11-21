import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configure, contract } from './http/setup';

async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  configure(app);
  try {
    const schema = contract(app);
    if (!schema.paths['/api/v1/auth/login'] || !schema.paths['/api/v1/uploads/{id}/parts/{number}']) {
      throw new Error('El prefijo o los endpoints esperados no están en OpenAPI.');
    }
    await writeFile('openapi.json', JSON.stringify(schema, null, 2) + '\n');
  } finally { await app.close(); }
}
run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
