import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from '../database/database.service';

@ApiTags('Estado')
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}

  @Get()
  async health() {
    await this.db.client.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
