import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ApiKey, Batch, Input, Suggestion } from './imports.dto';
import { ImportsService } from './imports.service';

@ApiTags('Importaciones')
@ApiCookieAuth('owner')
@Controller('imports')
export class ImportController {
  constructor(private readonly auth: AuthService, private readonly imports: ImportsService) {}

  private async owner(req: Request) { return (await this.auth.session(req)).ownerId; }

  @Post('inspect')
  async inspect(@Req() req: Request, @Body() input: Input) {
    await this.owner(req);
    return this.imports.inspect(input);
  }

  @Post()
  async start(@Req() req: Request, @Body() body: Batch) {
    return this.imports.start(await this.owner(req), body);
  }

  @Get()
  async list(@Req() req: Request) {
    return this.imports.list(await this.owner(req));
  }

  @Post(':id/retry') @HttpCode(202)
  async retry(@Req() req: Request, @Param('id') id: string) {
    return this.imports.retry(await this.owner(req), id);
  }

  @Get('deepseek')
  async info(@Req() req: Request) {
    return this.imports.info(await this.owner(req));
  }

  @Put('deepseek') @HttpCode(204)
  async set(@Req() req: Request, @Body() input: ApiKey) {
    return this.imports.set(await this.owner(req), input);
  }

  @Delete('deepseek') @HttpCode(204)
  async remove(@Req() req: Request) {
    return this.imports.remove(await this.owner(req));
  }

  @Post('deepseek/test')
  async test(@Req() req: Request) {
    return this.imports.test(await this.owner(req));
  }

  @Post('deepseek/suggest')
  async suggest(@Req() req: Request, @Body() body: Suggestion) {
    return this.imports.suggest(await this.owner(req), body);
  }

}
