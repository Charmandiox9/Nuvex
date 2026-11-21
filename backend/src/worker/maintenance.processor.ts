import type { Entry } from '../../prisma/generated/client';
import { log } from '../common/logging';
import { recordStorageVolume } from '../storage/volume';
import type { WorkerContext } from './worker-context';

const day = 86_400_000;

export async function purge({ database, storage }: Pick<WorkerContext, 'database' | 'storage'>, id: string) {
  const claim = await database.entry.updateMany({
    where: { id, trashedAt: { not: null } }, data: { purging: true },
  });
  if (!claim.count) return;
  const root = await database.entry.findUnique({ where: { id } });
  if (!root?.trashedAt) return;
  const descendants: Entry[] = [];
  const pending = [root];
  while (pending.length) {
    const row = pending.pop()!;
    descendants.push(row);
    pending.push(...await database.entry.findMany({ where: { ownerId: row.ownerId, parentId: row.id } }));
  }
  for (const row of descendants.reverse()) {
    const keys = new Set([row.objectKey, row.previewKey, row.posterKey, row.videoKey, row.iconKey].filter((key): key is string => Boolean(key)));
    for (const key of keys) await storage.delete(key);
    await database.entry.deleteMany({ where: { id: row.id } });
  }
}

export async function maintenance({ database, storage, queue }: WorkerContext) {
  const now = new Date();
  const stale = new Date(Date.now() - day);
  await Promise.all([
    recordStorageVolume(database).catch(() => log('warn', 'No se pudo registrar el espacio del volumen.')),
    database.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    database.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    database.upload.deleteMany({ where: { state: 'completed', updatedAt: { lt: stale } } }),
  ]);
  const uploads = await database.upload.findMany({
    where: { OR: [{ state: 'cancelled' }, { state: { in: ['open', 'finished-object'] }, updatedAt: { lt: stale } }] }, take: 50,
  });
  for (const upload of uploads) {
    const claim = await database.upload.updateMany({
      where: { id: upload.id, state: upload.state, updatedAt: upload.updatedAt }, data: { state: 'cancelled' },
    });
    if (!claim.count) continue;
    if (upload.multipartId) await storage.abort(upload.objectKey, upload.multipartId).catch((error: unknown) => {
      if ((error as { name?: string }).name !== 'NoSuchUpload') throw error;
    });
    await storage.delete(upload.objectKey);
    await database.upload.delete({ where: { id: upload.id } });
  }
  const [trashed, previews, imports, guests] = await Promise.all([
    database.entry.findMany({ where: { OR: [{ purging: true }, { trashedAt: { lt: new Date(Date.now() - 30 * day) } }] }, select: { id: true }, take: 100 }),
    database.entry.findMany({ where: { trashedAt: null, OR: [{ mediaStatus: 'queued' }, { mediaStatus: 'processing', updatedAt: { lt: new Date(Date.now() - 2 * 3600_000) } }] }, select: { id: true }, take: 100 }),
    database.importItem.findMany({ where: { OR: [{ state: 'queued' }, { state: 'processing', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, select: { id: true }, take: 100 }),
    database.guestSession.findMany({ where: { expiresAt: { lt: now } }, take: 50 }),
  ]);
  for (const guest of guests) {
    await storage.deletePrefix('guest/' + guest.id + '/');
    await database.guestSession.delete({ where: { id: guest.id } });
  }
  for (const [name, rows] of [['purge', trashed], ['preview', previews], ['import', imports]] as const) {
    for (const row of rows) await queue.add(name, { id: row.id }, { jobId: name + '-' + row.id });
  }
}
