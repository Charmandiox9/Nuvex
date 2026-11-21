import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Storage } from '../storage/storage';

export async function materialize(storage: Storage, key: string, path: string) {
  const { Body, ETag, compressed } = await storage.readOriginal(key);
  if (!Body) throw new Error('Objeto no disponible.');
  await pipeline(Body, createWriteStream(path));
  return { etag: ETag, compressed };
}

export async function saveFile(storage: Storage, key: string, path: string) {
  await storage.put(key, createReadStream(path), (await stat(path)).size);
}
