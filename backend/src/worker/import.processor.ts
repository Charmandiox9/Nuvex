import { join } from 'node:path';
import { serialTransaction } from '../../prisma/transaction';
import { quotaBytes } from '../storage/storage';
import { download } from './fetch-file';
import { temporary } from '../common/temporary';
import { saveFile } from './temporary-files';
import type { WorkerContext } from './worker-context';

const imageMime = /^image\/(jpeg|png|webp|gif|avif)$/;

export async function importItem({ database, storage, queue }: WorkerContext, id: string) {
  const item = await database.importItem.findUnique({ where: { id } });
  if (!item || item.state === 'completed') return;
  await database.importItem.update({ where: { id }, data: { state: 'processing', error: null } });
  const key = 'original/' + id;
  try {
    await temporary(async (dir) => {
      const path = join(dir, 'remote');
      const { length, type, finalUrl } = await download(item.url, path);
      const fallback = finalUrl.pathname.split('/').at(-1) || 'archivo';
      // eslint-disable-next-line no-control-regex
      const name = (item.name ?? fallback).replace(/[\x00-\x1F/\\]/g, '_').slice(0, 170).trim() || 'archivo';
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream';
      const mediaStatus = imageMime.test(mime) || mime.startsWith('video/') ? 'queued' : 'none';
      await saveFile(storage, key, path);
      await serialTransaction(database, async (tx) => {
        if (await tx.entry.findUnique({ where: { id } })) return;
        let parent = item.parentId;
        while (parent) {
          const folder = await tx.entry.findFirst({ where: { id: parent, ownerId: item.ownerId, kind: 'folder', trashedAt: null } });
          if (!folder) throw new Error('La carpeta de destino ya no está disponible.');
          parent = folder.parentId;
        }
        const [total, pending] = await Promise.all([
          tx.entry.aggregate({ where: { ownerId: item.ownerId }, _sum: { size: true } }),
          tx.upload.aggregate({ where: { ownerId: item.ownerId, state: { in: ['open', 'finished-object'] } }, _sum: { expectedSize: true } }),
        ]);
        if ((total._sum.size ?? 0n) + (pending._sum.expectedSize ?? 0n) + BigInt(length) > quotaBytes()) throw new Error('Cuota agotada.');
        const dest = { ownerId: item.ownerId, parentId: item.parentId, trashedAt: null };
        let final = name;
        for (let index = 2; await tx.entry.findFirst({ where: { ...dest, name: final }, select: { id: true } }); index++) final = name + ' (' + index + ')';
        await tx.entry.create({ data: { ...dest, id, name: final, kind: 'file', objectKey: key, mime, size: BigInt(length), mediaStatus } });
        await tx.importItem.update({ where: { id }, data: { state: 'completed', entryId: id } });
      });
      if (mediaStatus === 'queued') await queue.add('preview', { id }, { jobId: 'preview-' + id }).catch(() => undefined);
    });
  } catch (error) {
    if (await database.entry.findUnique({ where: { id } })) return;
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}
