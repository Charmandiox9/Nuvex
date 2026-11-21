import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { GuestController, ShareController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [AuthModule, DatabaseModule, FilesModule, QueueModule, StorageModule],
  controllers: [ShareController, GuestController],
  providers: [SharesService],
})
export class SharesModule {}
