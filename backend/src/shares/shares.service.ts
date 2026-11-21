import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { AuthService } from '../auth/auth.service';
import { cookieOptions } from '../auth/session-cookie';
import { sendEmail } from '../common/email';
import { digest, secretHash, token } from '../common/security';
import { Database } from '../database/database.service';
import { serializeEntry } from '../files/file-entry';
import { FilesService } from '../files/files.service';
import { QueueService } from '../queue/queue.service';
import { Storage } from '../storage/storage';
import type { ShareBody } from './shares.dto';

const guestCookie = 'nuvex_guest';
const guestPath = (id: string) => '/api/v1/guest/' + id;
function safeShare<T extends { codeHash: string }>(share: T) {
  const { codeHash, ...rest } = share;
  void codeHash;
  return rest;
}

@Injectable()
export class SharesService {
  constructor(
    private readonly files: FilesService,
    private readonly auth: AuthService,
    private readonly db: Database,
    private readonly storage: Storage,
    private readonly queue: QueueService,
  ) {}

  async create(ownerId: string, input: ShareBody) {
    await this.files.active(ownerId, input.entryId);
    const code = token(12).toUpperCase();
    const share = await this.db.client.share.create({ data: {
      ownerId, entryId: input.entryId, codeHash: secretHash('share', code), remaining: input.uses, maxUses: input.uses,
      expiresAt: new Date(Date.now() + input.hours * 3_600_000), allowDownload: input.allowDownload,
    } });
    const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
    return {
      ...safeShare(share), code, path: '/s/' + share.id,
      qr: await QRCode.toDataURL(origin + '/s/' + share.id),
    };
  }

  async send(ownerId: string, id: string, to: string, code: string) {
    await this.auth.limit('share-send', ownerId, 20);
    const share = await this.db.client.share.findFirst({ where: { id, ownerId, revokedAt: null } });
    if (!share || share.expiresAt <= new Date()) throw new NotFoundException('Enlace no disponible.');
    if (share.codeHash !== secretHash('share', code.trim().toUpperCase())) {
      throw new ForbiddenException('El código no corresponde al enlace.');
    }
    const key = process.env.RESEND_API_KEY;
    const from = process.env.NUVEX_ALERT_FROM;
    if (!key || !from) throw new ServiceUnavailableException('El envío por email no está configurado.');
    const entry = await this.db.client.entry.findUnique({ where: { id: share.entryId }, select: { name: true } });
    const link = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000') + '/s/' + share.id;
    const text = 'Te han compartido «' + (entry?.name ?? 'un elemento') + '» en Nuvex.\n\n'
      + 'Enlace: ' + link + '\n'
      + 'Código: ' + code.trim().toUpperCase() + '\n'
      + 'Vence: ' + share.expiresAt.toISOString() + '\n';
    await sendEmail({
      key, from, to, subject: 'Invitación a un enlace de Nuvex', text,
      idempotencyKey: 'share-' + share.id + '-' + digest(to) + '-' + Math.floor(Date.now() / 60_000),
    });
  }

  async list(ownerId: string) {
    const rows = await this.db.client.share.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const [entries, redemptions] = await Promise.all([
      this.db.client.entry.findMany({
        where: { ownerId, id: { in: rows.map((row) => row.entryId) } },
        select: { id: true, name: true },
      }),
      this.db.client.audit.groupBy({
        by: ['target'], where: { ownerId, action: 'share.redeemed', target: { in: rows.map((row) => row.id) } },
        _max: { createdAt: true },
      }),
    ]);
    const names = new Map(entries.map((row) => [row.id, row.name]));
    const last = new Map(redemptions.map((row) => [row.target, row._max.createdAt]));
    return rows.map((row) => ({ ...safeShare(row), entryName: names.get(row.entryId), lastRedeemedAt: last.get(row.id) }));
  }

  async redeem(id: string, code: string, req: Request, res: Response) {
    await this.auth.limit('guest', id + ':' + (req.ip ?? ''), 12);
    await this.auth.limit('guest-ip', req.ip ?? '', 40);
    const raw = token();
    const expiresAt = await this.db.client.$transaction(async (tx) => {
      const now = new Date();
      const share = await tx.share.findUnique({ where: { id } });
      if (!share) throw new ForbiddenException('Enlace o código no disponible.');
      await this.files.active(share.ownerId, share.entryId, tx);
      const updated = await tx.share.updateMany({
        where: { id, codeHash: secretHash('share', code.trim().toUpperCase()), revokedAt: null, expiresAt: { gt: now }, remaining: { gt: 0 } },
        data: { remaining: { decrement: 1 } },
      });
      if (!updated.count) throw new ForbiddenException('Enlace o código no disponible.');
      const expiresAt = new Date(Math.min(share.expiresAt.getTime(), now.getTime() + 30 * 60_000));
      await tx.guestSession.create({ data: { tokenHash: digest(raw), shareId: id, expiresAt } });
      await tx.audit.create({ data: { ownerId: share.ownerId, action: 'share.redeemed', target: id } });
      return expiresAt;
    });
    res.cookie(guestCookie, raw, { ...cookieOptions(), path: guestPath(id), expires: expiresAt });
    return { expiresAt };
  }

  async allowed(id: string, req: Request, entryId?: string) {
    const raw: unknown = req.cookies[guestCookie];
    if (typeof raw !== 'string') throw new ForbiddenException('Introduce el código del enlace.');
    const db = this.db.client;
    const [share, session] = await Promise.all([
      db.share.findUnique({ where: { id } }),
      db.guestSession.findFirst({ where: { tokenHash: digest(raw), shareId: id, expiresAt: { gt: new Date() } } }),
    ]);
    if (!share || !session || share.revokedAt || share.expiresAt <= new Date()) {
      throw new ForbiddenException('Tu acceso ha vencido o se ha revocado.');
    }
    const root = await this.files.active(share.ownerId, share.entryId);
    const row = entryId && entryId !== root.id ? await this.files.active(share.ownerId, entryId) : root;
    let current = row;
    while (current.id !== root.id && current.parentId) current = await this.files.entry(share.ownerId, current.parentId);
    if (current.id !== root.id) throw new NotFoundException('Elemento no disponible.');
    return { share, session, row, root };
  }

  async revoke(ownerId: string, id: string) {
    await this.db.client.share.updateMany({ where: { id, ownerId }, data: { revokedAt: new Date() } });
  }

  async view(id: string, req: Request, entryId?: string, cursor?: string) {
    const { share, row, root, session } = await this.allowed(id, req, entryId);
    const page = row.kind === 'folder' ? await this.files.list(share.ownerId, row.id, '', 'files', cursor) : { items: [] };
    return {
      rootId: root.id, allowDownload: share.allowDownload, expiresAt: session.expiresAt,
      entry: serializeEntry(row), ...page,
    };
  }

  async prepare(shareId: string, id: string, req: Request) {
    const { share, session, row } = await this.allowed(shareId, req, id);
    if (row.kind !== 'file') throw new NotFoundException('Archivo no disponible.');
    if (share.allowDownload) return { ready: Boolean(row.previewKey || row.videoKey) };
    const key = 'guest/' + session.id + '/' + id;
    if (await this.storage.head(key).catch(() => null)) return { ready: true };
    if (row.previewKey || row.posterKey || row.videoKey) {
      const job = await this.queue.enqueue('watermark', id, session.id);
      if (await job.isFailed()) return { ready: false, error: 'No se pudo preparar la vista previa.' };
    }
    return { ready: false, ...(!row.previewKey && !row.posterKey && !row.videoKey ? { error: 'Vista previa no disponible.' } : {}) };
  }

  async content(shareId: string, id: string, req: Request, res: Response, mode: string) {
    const { share, session, row } = await this.allowed(shareId, req, id);
    if (row.kind !== 'file') throw new NotFoundException('Archivo no disponible.');
    if (mode === 'download' && !share.allowDownload) throw new ForbiddenException('El propietario deshabilitó las descargas.');
    if (share.allowDownload) return this.files.content(share.ownerId, id, mode, req, res);
    if (row.mime.startsWith('audio/')) {
      if (!row.objectKey) throw new NotFoundException('Archivo no disponible.');
      return this.files.stream(res, req, row.objectKey, row.mime);
    }
    const mime = row.mime.startsWith('video/') ? 'video/mp4' : 'image/webp';
    return this.files.stream(res, req, 'guest/' + session.id + '/' + id, mime);
  }
}
