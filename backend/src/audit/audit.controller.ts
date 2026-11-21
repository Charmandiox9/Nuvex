import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuditService } from './audit.service';

@ApiTags('Auditoría')
@ApiCookieAuth('owner')
@Controller('audit')
export class AuditController {
  constructor(private readonly auth: AuthService, private readonly audit: AuditService) {}

  @Get()
  async list(@Req() req: Request, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.audit.list((await this.auth.session(req)).ownerId, cursor, Number(limit) || undefined);
  }
}
