import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '../../prisma/client';

@Injectable()
export class Database implements OnModuleDestroy {
  readonly client = createDatabase();

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
