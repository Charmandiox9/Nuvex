import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
