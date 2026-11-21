import { randomUUID } from 'node:crypto';
import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

type Level = 'info' | 'warn' | 'error';
const sensitive = /pass|secret|token|code|cookie|auth|key|totp|recovery|credential/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

function redactObject(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = sensitive.test(key) ? '[redacted]' : redactValue(value);
  }
  return output;
}

export function log(level: Level, message: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...redactObject(meta) });
  (level === 'info' ? process.stdout : process.stderr).write(line + '\n');
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && header ? header.slice(0, 64) : randomUUID();
  res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => {
    const level: Level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log(level, 'request', { requestId: id, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start });
  });
  next();
}

function emit(level: Level, message: unknown, optional: unknown[]) {
  const context = optional.length && typeof optional.at(-1) === 'string' ? (optional.at(-1) as string) : undefined;
  log(level, String(message), context ? { context } : {});
}

export class JsonLogger implements LoggerService {
  log(message: unknown, ...optional: unknown[]) { emit('info', message, optional); }
  error(message: unknown, ...optional: unknown[]) { emit('error', message, optional); }
  warn(message: unknown, ...optional: unknown[]) { emit('warn', message, optional); }
  debug(message: unknown, ...optional: unknown[]) { emit('info', message, optional); }
  verbose(message: unknown, ...optional: unknown[]) { emit('info', message, optional); }
}
