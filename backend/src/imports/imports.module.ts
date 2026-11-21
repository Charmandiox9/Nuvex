import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { QueueModule } from '../queue/queue.module';
import { ImportController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuthModule, DatabaseModule, FilesModule, QueueModule],
  controllers: [ImportController],
  providers: [ImportsService],
})
export class ImportsModule {}
