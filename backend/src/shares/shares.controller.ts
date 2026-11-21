import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { RedeemBody, ShareBody } from './shares.dto';
import { SharesService } from './shares.service';

@ApiTags('Enlaces')
@Controller('shares')
@ApiCookieAuth('owner')
export class ShareController {
  constructor(private readonly auth: AuthService, private readonly shares: SharesService) {}

  @Get()
  async list(@Req() req: Request) {
    return this.shares.list((await this.auth.session(req)).ownerId);
  }

  @Post()
  async create(@Req() req: Request, @Body() input: ShareBody) {
    return this.shares.create((await this.auth.session(req)).ownerId, input);
  }

  @Delete(':id') @HttpCode(204)
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const { ownerId } = await this.auth.session(req);
    await this.shares.revoke(ownerId, id);
  }
}

@ApiTags('Invitados')
@Controller('guest/:shareId')
export class GuestController {
  constructor(private readonly shares: SharesService) {}

  @Post('redeem') @HttpCode(200)
  redeem(@Param('shareId') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() input: RedeemBody) {
    return this.shares.redeem(id, input.code, req, res);
  }

  @Get() @ApiCookieAuth('guest')
  view(@Param('shareId') id: string, @Req() req: Request, @Query('entry') entryId?: string, @Query('cursor') cursor?: string) {
    return this.shares.view(id, req, entryId, cursor);
  }

  @Post('preview/:id') @HttpCode(202) @ApiCookieAuth('guest')
  prepare(@Param('shareId') shareId: string, @Param('id') id: string, @Req() req: Request) {
    return this.shares.prepare(shareId, id, req);
  }

  @Get('content/:id') @ApiCookieAuth('guest')
  content(@Param('shareId') shareId: string, @Param('id') id: string, @Req() req: Request, @Res() res: Response, @Query('mode') mode = 'preview') {
    return this.shares.content(shareId, id, req, res, mode);
  }
}
