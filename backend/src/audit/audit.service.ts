import { Injectable } from '@nestjs/common';
import { Database } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: Database) {}

  async list(ownerId: string, cursor?: string) {
    const rows = await this.db.client.audit.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    return {
      items: page.map((row) => ({ id: row.id, action: row.action, target: row.target ?? undefined, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > 50 ? page.at(-1)?.id : undefined,
    };
  }
}
