import { Injectable } from '@nestjs/common';
import { Database } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: Database) {}

  async list(ownerId: string, cursor?: string, limit = 50) {
    const take = Math.min(Math.max(Math.trunc(Number.isFinite(limit) ? limit : 50), 1), 50);
    const rows = await this.db.client.audit.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((row) => ({ id: row.id, action: row.action, target: row.target ?? undefined, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > take ? page.at(-1)?.id : undefined,
    };
  }
}
