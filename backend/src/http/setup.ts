import { HttpException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';

export function configure(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') server.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('x-nuvex-request') !== '1' ||
        (req.get('origin') && req.get('origin') !== (process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000'))) {
        res.status(403).json({ statusCode: 403, message: 'Origen o encabezado de seguridad inválido.' });
        return;
      }
    }
    next();
  });
  (app as NestExpressApplication).useBodyParser('json', { limit: '600kb' });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    exceptionFactory: () => new HttpException('Comprueba los datos enviados.', 400),
  }));
}

export function contract(app: INestApplication) {
  return SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Nuvex API').setVersion('1.0.0')
    .setDescription('Drive personal. En cada escritura usa X-Nuvex-Request: 1 desde el mismo origen. Los errores incluyen statusCode y message.')
    .addCookieAuth('nuvex_session', undefined, 'owner').addCookieAuth('nuvex_guest', undefined, 'guest')
    .addGlobalParameters({ name: 'X-Nuvex-Request', in: 'header', required: false, schema: { type: 'string', default: '1' } })
    .build());
}
