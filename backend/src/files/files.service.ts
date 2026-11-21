import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import archiver from 'archiver';
import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Entry, Prisma } from '../../prisma/generated/client';
import { serialTransaction } from '../../prisma/transaction';
import { Database } from '../database/database.service';
import { QueueService } from '../queue/queue.service';
import { partSize, quotaBytes, Storage } from '../storage/storage';
import { cleanName, mediaKind, serializeEntry } from './file-entry';
import type { ChangeBody, FolderBody, UploadBody } from './files.dto';

type Db = Database['client'] | Prisma.TransactionClient;
type Destination = { ownerId: string; parentId: string; name: string };
const zipSegment = (name: string) => {
  const cleaned = Array.from(name).filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) >= 32).join('').trim();
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : 'archivo';
};

@Injectable()
export class FilesService {
  constructor(
    private readonly db: Database,
    private readonly storage: Storage,
    private readonly queue: QueueService,
  ) {}

  async quota(ownerId: string) {
    const total = await this.db.client.entry.aggregate({ where: { ownerId }, _sum: { size: true } });
    return { used: (total._sum.size ?? 0n).toString(), quota: quotaBytes().toString() };
  }

  async process(ownerId: string, id: string, transcode: boolean) {
    const row = await this.active(ownerId, id);
    if (!mediaKind(row.mime)) throw new UnsupportedMediaTypeException();
    await this.db.client.entry.updateMany({ where: { id, mediaStatus: { not: 'processing' } }, data: { mediaStatus: 'queued' } });
    const name = transcode ? 'transcode' : 'preview';
    const old = await this.queue.getJob(name + '-' + id);
    if (old && await old.isFailed()) await old.retry();
    else await this.queue.enqueue(name, id);
  }

  async entry(ownerId: string, id: string, db: Db = this.db.client, trashed = false) {
    const row = await db.entry.findFirst({ where: { id, ownerId, ...(!trashed ? { trashedAt: null } : {}) } });
    if (!row) throw new NotFoundException('Elemento no encontrado.');
    return row;
  }

  async active(ownerId: string, id: string, db: Db = this.db.client) {
    const row = await this.entry(ownerId, id, db);
    let parentId = row.parentId;
    while (parentId) parentId = (await this.entry(ownerId, parentId, db)).parentId;
    return row;
  }

  async folder(ownerId: string, parentId: string, db: Db = this.db.client) {
    if (parentId && (await this.active(ownerId, parentId, db)).kind !== 'folder') {
      throw new BadRequestException('El destino debe ser una carpeta.');
    }
  }

  async available(db: Db, dest: Destination, except?: string, overwrite = false) {
    const where = { ...dest, trashedAt: null, ...(except ? { id: { not: except } } : {}) };
    const found = await db.entry.findFirst({ where });
    if (!found) return;
    if (overwrite && found.kind === 'file') {
      await db.entry.update({ where: { id: found.id }, data: { trashedAt: new Date() } });
      return;
    }
    const base = dest.name.slice(0, 175);
    let index = 2;
    let suggestedName = base + ' (' + index + ')';
    while (await db.entry.findFirst({ where: { ...where, name: suggestedName }, select: { id: true } })) {
      suggestedName = base + ' (' + ++index + ')';
    }
    throw new ConflictException({ statusCode: 409, message: 'Ya existe un elemento con ese nombre.', suggestedName });
  }

  async list(ownerId: string, parentId: string, search: string, view: string, cursor?: string, sort = 'name') {
    if (view === 'files') await this.folder(ownerId, parentId);
    const query = search.trim().slice(0, 200);
    const sortBy: Prisma.EntryOrderByWithRelationInput = sort === 'recent' ? { updatedAt: 'desc' } : sort === 'size' ? { size: 'desc' } : { name: 'asc' };
    const rows = await this.db.client.entry.findMany({
      where: {
        ownerId, trashedAt: view === 'trash' ? { not: null } : null,
        ...(view === 'gallery' ? { mediaStatus: { not: 'none' } } : {}),
        ...(view === 'files' && !query ? { parentId } : {}),
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
      },
      orderBy: [sortBy, { id: 'asc' }], take: 101, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 100);
    const visible = view !== 'trash' && (query || view === 'gallery')
      ? (await Promise.all(page.map(async (row) => {
        try { return await this.active(ownerId, row.id); }
        catch (error) { if (error instanceof NotFoundException) return null; throw error; }
      }))).filter((row): row is Entry => row !== null)
      : page;
    return { items: visible.map(serializeEntry), nextCursor: rows.length > 100 ? page.at(-1)?.id : undefined };
  }

  async folderCreate(ownerId: string, body: FolderBody, reuse = false) {
    return serialTransaction(this.db.client, async (tx) => {
      const dest = { ownerId, parentId: body.parentId, name: cleanName(body.name) };
      await this.folder(ownerId, dest.parentId, tx);
      if (reuse) {
        const existing = await tx.entry.findFirst({ where: { ...dest, kind: 'folder', trashedAt: null } });
        if (existing) return serializeEntry(existing);
      }
      await this.available(tx, dest);
      return serializeEntry(await tx.entry.create({ data: { ...dest, kind: 'folder' } }));
    });
  }

  async update(ownerId: string, id: string, body: ChangeBody, restore = false) {
    return serialTransaction(this.db.client, async (tx) => {
      const row = restore ? await this.entry(ownerId, id, tx, true) : await this.active(ownerId, id, tx);
      if (restore && !row.trashedAt) throw new ConflictException('Este elemento ya está activo.');
      if (row.purging) throw new ConflictException('El elemento ya se está eliminando.');
      const dest = { ownerId, name: body.name === undefined ? row.name : cleanName(body.name), parentId: body.parentId ?? row.parentId };
      await this.folder(ownerId, dest.parentId, tx);
      let ancestor = dest.parentId;
      while (ancestor) {
        if (ancestor === id) throw new BadRequestException('La carpeta no puede contenerse a sí misma.');
        ancestor = (await this.entry(ownerId, ancestor, tx)).parentId;
      }
      await this.available(tx, dest, id, body.overwrite && row.kind === 'file');
      return serializeEntry(await tx.entry.update({ where: { id }, data: { ...dest, trashedAt: null } }));
    });
  }

  async copy(ownerId: string, id: string, body: ChangeBody) {
    const originals: Entry[] = [];
    const source = await this.active(ownerId, id);
    async function collect(db: Db, row: Entry) {
      originals.push(row);
      if (originals.length > 500) throw new BadRequestException('Copia hasta 500 elementos por operación.');
      if (row.kind === 'folder') {
        const children = await db.entry.findMany({ where: { ownerId, parentId: row.id, trashedAt: null } });
        for (const child of children) await collect(db, child);
      }
    }
    await collect(this.db.client, source);
    const remap = new Map(originals.map((row) => [row.id, randomUUID()]));
    const dest = { ownerId, parentId: body.parentId ?? source.parentId, name: body.name === undefined ? source.name : cleanName(body.name) };
    await this.folder(ownerId, dest.parentId);
    await this.available(this.db.client, dest);
    const copiedObjects: string[] = [];
    try {
      for (const row of originals) {
        if (!row.objectKey) continue;
        const key = 'original/' + remap.get(row.id);
        await this.storage.copy(row.objectKey, key);
        copiedObjects.push(key);
      }
      await serialTransaction(this.db.client, async (tx) => {
        await this.folder(ownerId, dest.parentId, tx);
        await this.available(tx, dest);
        await this.reserve(tx, ownerId, originals.reduce((sum, row) => sum + row.size, 0n));
        await tx.entry.createMany({ data: originals.map((row) => ({
          id: remap.get(row.id), ownerId, name: row.id === id ? dest.name : row.name,
          parentId: row.id === id ? dest.parentId : remap.get(row.parentId),
          kind: row.kind, mime: row.mime, size: row.size,
          objectKey: row.objectKey ? 'original/' + remap.get(row.id) : null,
          mediaStatus: mediaKind(row.mime) ? 'queued' : 'none',
        })) });
      });
    } catch (error) {
      await Promise.allSettled(copiedObjects.map((key) => this.storage.delete(key)));
      throw error;
    }
    await Promise.allSettled(originals.filter((row) => mediaKind(row.mime)).map((row) =>
      this.queue.enqueue('preview', remap.get(row.id)!)));
    return serializeEntry(await this.entry(ownerId, remap.get(id)!));
  }

  async trash(ownerId: string, id: string) {
    await this.active(ownerId, id);
    await this.db.client.entry.update({ where: { id }, data: { trashedAt: new Date() } });
  }

  async remove(ownerId: string, id: string, confirmed: boolean) {
    const row = await this.entry(ownerId, id, this.db.client, true);
    if (!row.trashedAt || !confirmed) throw new BadRequestException('Confirma el borrado de un elemento de la papelera.');
    const claimed = await this.db.client.entry.updateMany({ where: { id, trashedAt: { not: null } }, data: { purging: true } });
    if (!claimed.count) throw new ConflictException('El elemento ya fue restaurado.');
    await this.queue.enqueue('purge', id);
  }

  async reserve(tx: Db, ownerId: string, extra: bigint) {
    const [existing, pending] = await Promise.all([
      tx.entry.aggregate({ where: { ownerId }, _sum: { size: true } }),
      tx.upload.aggregate({ where: { ownerId, state: { in: ['open', 'finished-object'] } }, _sum: { expectedSize: true } }),
    ]);
    if ((existing._sum.size ?? 0n) + (pending._sum.expectedSize ?? 0n) + extra > quotaBytes()) {
      throw new HttpException('No queda espacio en la cuota del propietario.', 413);
    }
  }

  async uploadStart(ownerId: string, body: UploadBody) {
    const name = cleanName(body.name);
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(body.mime) ? body.mime.toLowerCase() : 'application/octet-stream';
    const id = randomUUID();
    const objectKey = 'original/' + id;
    const multipartId = body.size ? await this.storage.start(objectKey) : null;
    try {
      await serialTransaction(this.db.client, async (tx) => {
        await this.folder(ownerId, body.parentId, tx);
        // Finalization rechecks the target before making the upload visible.
        if (!body.overwrite) await this.available(tx, { ownerId, parentId: body.parentId, name });
        await this.reserve(tx, ownerId, BigInt(body.size));
        await tx.upload.create({ data: {
          id, ownerId, parentId: body.parentId, name, mime, expectedSize: BigInt(body.size),
          fingerprint: body.fingerprint, objectKey, multipartId,
        } });
      });
    } catch (error) {
      if (multipartId) await this.storage.abort(objectKey, multipartId).catch(() => undefined);
      throw error;
    }
    return { id, partSize };
  }

  async upload(ownerId: string, id: string) {
    const upload = await this.db.client.upload.findFirst({ where: { id, ownerId } });
    if (!upload) throw new NotFoundException('Subida no encontrada.');
    return upload;
  }

  async uploadStatus(ownerId: string, id: string) {
    const row = await this.upload(ownerId, id);
    let state = row.state;
    const parts = row.state === 'open' && row.multipartId
      ? await this.storage.parts(row.objectKey, row.multipartId).catch(async (error: unknown) => {
        const object = await this.storage.head(row.objectKey).catch(() => null);
        if (object?.ContentLength !== Number(row.expectedSize)) throw error;
        const changed = await this.db.client.upload.updateMany({
          where: { id, ownerId, state: 'open' }, data: { state: 'finished-object' },
        });
        state = changed.count ? 'finished-object' : (await this.upload(ownerId, id)).state;
        return [];
      }) : [];
    return { id, state, fingerprint: row.fingerprint, name: row.name, size: Number(row.expectedSize), partSize, parts };
  }

  async uploadPart(ownerId: string, id: string, number: number, req: Request) {
    const row = await this.upload(ownerId, id);
    const size = Number(row.expectedSize);
    if (row.state !== 'open' || !row.multipartId || !Number.isInteger(number) || number < 1 || number > Math.ceil(size / partSize)) {
      throw new BadRequestException('Parte de subida inválida.');
    }
    const expected = Math.min(partSize, size - (number - 1) * partSize);
    if (Number(req.get('content-length')) !== expected || (req.get('content-type') ?? '') !== 'application/octet-stream') {
      throw new BadRequestException('Longitud o tipo del bloque inválido.');
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      received += bytes.length;
      if (received > expected) throw new BadRequestException('Bloque demasiado grande.');
      chunks.push(bytes);
    }
    if (received !== expected) throw new BadRequestException('Bloque incompleto.');
    await this.storage.putPart(row.objectKey, row.multipartId, number, Buffer.concat(chunks, received));
    await this.db.client.upload.updateMany({ where: { id, state: 'open' }, data: { updatedAt: new Date() } });
  }

  async uploadComplete(ownerId: string, id: string, overwrite: boolean) {
    const row = await this.upload(ownerId, id);
    if (row.state === 'completed' && row.entryId) return serializeEntry(await this.entry(ownerId, row.entryId));
    if (!['open', 'finished-object'].includes(row.state)) throw new ConflictException('La subida ya no está activa.');
    let object = await this.storage.head(row.objectKey).catch(() => null);
    if (!object && row.multipartId) {
      const parts = await this.storage.parts(row.objectKey, row.multipartId);
      const size = Number(row.expectedSize);
      if (parts.length !== Math.ceil(size / partSize) || parts.some((item, index) =>
        item.PartNumber !== index + 1 || item.Size !== Math.min(partSize, size - index * partSize))) {
        throw new ConflictException('Faltan partes para finalizar esta subida.');
      }
      await this.storage.complete(row.objectKey, row.multipartId, parts).catch(async (error: unknown) => {
        if (!(await this.storage.head(row.objectKey).catch(() => null))) throw error;
      });
    } else if (!object) {
      await this.storage.put(row.objectKey, Buffer.alloc(0), 0);
    }
    object ??= await this.storage.head(row.objectKey);
    if (object.ContentLength !== Number(row.expectedSize)) throw new ConflictException('El tamaño almacenado no coincide.');
    await this.db.client.upload.updateMany({ where: { id, state: 'open' }, data: { state: 'finished-object' } });
    const result = await serialTransaction(this.db.client, async (tx) => {
      const fresh = await tx.upload.findUniqueOrThrow({ where: { id } });
      if (fresh.state === 'completed' && fresh.entryId) return tx.entry.findUniqueOrThrow({ where: { id: fresh.entryId } });
      if (fresh.state !== 'finished-object') throw new ConflictException('La subida ya no está activa.');
      await this.folder(ownerId, fresh.parentId, tx);
      const dest = { ownerId, parentId: fresh.parentId, name: fresh.name };
      await this.available(tx, dest, undefined, overwrite);
      const created = await tx.entry.create({ data: {
        ...dest, id, mime: fresh.mime, size: fresh.expectedSize,
        objectKey: fresh.objectKey, kind: 'file', mediaStatus: mediaKind(fresh.mime) ? 'queued' : 'none',
      } });
      await tx.upload.update({ where: { id }, data: { state: 'completed', entryId: created.id } });
      return created;
    });
    if (result.mediaStatus === 'queued') await this.queue.enqueue('preview', id).catch(() => undefined);
    return serializeEntry(result);
  }

  async uploadCancel(ownerId: string, id: string) {
    const row = await this.upload(ownerId, id);
    await this.db.client.upload.updateMany({
      where: { id: row.id, state: { in: ['open', 'finished-object'] } }, data: { state: 'cancelled' },
    });
  }



  async stream(res: Response, req: Request, key: string, mime: string, download?: string) {
    let range = req.get('range');
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new HttpException('Rango inválido.', 416);
    if (range === 'bytes=0-' && req.method === 'HEAD') range = undefined;
    let object: Awaited<ReturnType<Storage['read']>>;
    try {
      object = await this.storage.read(key, range);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 416) throw new HttpException('Rango fuera del archivo.', 416);
      if (status === 404) throw new NotFoundException('Archivo no disponible.');
      throw error;
    }
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    if (object.ContentLength !== undefined) res.set('Content-Length', String(object.ContentLength));
    if (object.ContentRange) res.status(206).set('Content-Range', object.ContentRange);
    if (download) res.attachment(download).type('application/octet-stream');
    if (!object.Body) throw new NotFoundException('Archivo no disponible.');
    await pipeline(object.Body as Readable, res);
  }

  async content(ownerId: string, id: string, mode: string, req: Request, res: Response) {
    const row = await this.active(ownerId, id);
    if (!row.objectKey) throw new NotFoundException('Archivo no encontrado.');
    if (mode === 'download') return this.stream(res, req, row.objectKey, row.mime, row.name);
    if (mode === 'thumb' && (row.previewKey || row.posterKey)) return this.stream(res, req, (row.posterKey ?? row.previewKey)!, 'image/webp');
    if (mode === 'preview' && row.previewKey) return this.stream(res, req, row.previewKey, 'image/webp');
    if (mode === 'preview' && row.videoKey) return this.stream(res, req, row.videoKey, row.videoKey === row.objectKey ? row.mime : 'video/mp4');
    throw new UnsupportedMediaTypeException('La vista previa todavía no está disponible.');
  }

  async archive(ownerId: string, id: string, res: Response) {
    const root = await this.active(ownerId, id);
    if (root.kind !== 'folder') throw new BadRequestException('Solo se pueden descargar carpetas.');
    const maxEntries = 100_000;
    const nodes: { row: Entry; path: string }[] = [];
    const queue: { row: Entry; path: string }[] = [{ row: root, path: zipSegment(root.name) }];
    while (queue.length) {
      const node = queue.shift()!;
      nodes.push(node);
      if (node.row.kind !== 'folder') continue;
      if (nodes.length > maxEntries) throw new HttpException('La carpeta es demasiado grande para descargarla.', 413);
      const children = await this.db.client.entry.findMany({
        where: { ownerId, parentId: node.row.id, trashedAt: null }, orderBy: { name: 'asc' },
      });
      for (const child of children) queue.push({ row: child, path: node.path + '/' + zipSegment(child.name) });
    }
    const base = zipSegment(root.name);
    res.attachment(base + '.zip');
    res.set({ 'Content-Type': 'application/zip', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => { if (!res.destroyed) res.destroy(error); });
    res.on('close', () => { if (!res.writableEnded) archive.destroy(); });
    archive.pipe(res);
    for (const { row, path } of nodes) {
      if (res.destroyed) return;
      if (row.kind !== 'file' || !row.objectKey) continue;
      const object = await this.storage.read(row.objectKey);
      if (!object.Body) continue;
      const body = object.Body as Readable;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        body.once('end', finish);
        body.once('error', finish);
        body.once('close', finish);
        archive.append(body, { name: path });
      });
    }
    if (!res.destroyed) await archive.finalize();
  }
}
