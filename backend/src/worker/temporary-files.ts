import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Storage } from '../storage/storage';

export async function temporary<T>(callback: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'nuvex-'));
  try { return await callback(dir); }
  finally { await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

export async function materialize(storage: Storage, key: string, path: string) {
  const { Body } = await storage.read(key);
  if (!Body) throw new Error('Objeto no disponible.');
  await pipeline(Body as Readable, createWriteStream(path));
}

export async function saveFile(storage: Storage, key: string, path: string) {
  await storage.put(key, createReadStream(path), (await stat(path)).size);
}
