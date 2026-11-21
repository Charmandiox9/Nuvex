import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function temporary<T>(callback: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'nuvex-'));
  try { return await callback(dir); }
  finally { await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
