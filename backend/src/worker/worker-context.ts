import type { createDatabase } from '../../prisma/client';
import type { openQueue } from '../queue/queue';
import type { Storage } from '../storage/storage';

export type WorkerContext = {
  database: ReturnType<typeof createDatabase>;
  storage: Storage;
  queue: ReturnType<typeof openQueue>;
};
