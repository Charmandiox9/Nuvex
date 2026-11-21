import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { FileController } from './files.controller';
import { FilesResolver } from './files.resolver';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, DatabaseModule, QueueModule, StorageModule],
  controllers: [FileController],
  providers: [FilesService, FilesResolver],
  exports: [FilesService],
})
export class FilesModule {}
