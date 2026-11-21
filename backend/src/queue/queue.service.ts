import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { openQueue } from './queue';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue = openQueue();

  onModuleDestroy() { return this.queue.close(); }

  getJob(id: string) { return this.queue.getJob(id); }

  async ping() {
    const client = await this.queue.client;
    await (client as unknown as { ping: () => Promise<string> }).ping();
  }

  enqueue(name: string, id: string, guestId?: string) {
    return this.queue.add(name, { id, guestId }, { jobId: [name, id, guestId].filter(Boolean).join('-') });
  }
}
