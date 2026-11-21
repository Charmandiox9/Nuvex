import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from '../database/database.service';
import { QueueService } from '../queue/queue.service';
import { Storage } from '../storage/storage';

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

@ApiTags('Estado')
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database, private readonly queue: QueueService, private readonly storage: Storage) {}

  @Get()
  async health() {
    const check = async (task: () => Promise<unknown>) => {
      try { await withTimeout(task(), 2000); return 'ok'; } catch { return 'error'; }
    };
    const [database, redis, storage] = await Promise.all([
      check(() => this.db.client.$queryRaw`SELECT 1`),
      check(() => this.queue.ping()),
      check(() => this.storage.ping()),
    ]);
    const checks = { database, redis, storage };
    return { status: Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'degraded', checks };
  }
}
