import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JsonLogger, requestLogger } from './common/logging';
import { configure, contract } from './http/setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.use(requestLogger);
  configure(app);
  if (process.env.SWAGGER_ENABLED !== '0') SwaggerModule.setup('api/docs', app, contract(app));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), process.env.API_HOST ?? '127.0.0.1');
}

void bootstrap();
