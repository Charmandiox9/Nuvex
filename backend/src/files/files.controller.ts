import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ChangeBody, ConfirmBody, FolderBody, UploadBody, UploadCreated } from './files.dto';
import { FilesService } from './files.service';

@ApiTags('Archivos')
@ApiCookieAuth('owner')
@Controller()
export class FileController {
  constructor(private readonly auth: AuthService, private readonly files: FilesService) {}
  private async owner(req: Request) { return (await this.auth.session(req)).ownerId; }

  @Get('quota')
  async quota(@Req() req: Request) {
    return this.files.quota(await this.owner(req));
  }

  @Post('folders')
  async folder(@Req() req: Request, @Body() body: FolderBody) {
    return this.files.folderCreate(await this.owner(req), body);
  }

  @Post('folders/ensure')
  async ensureFolder(@Req() req: Request, @Body() body: FolderBody) {
    return this.files.folderCreate(await this.owner(req), body, true);
  }

  @Patch('entries/:id')
  async edit(@Req() req: Request, @Param('id') id: string, @Body() body: ChangeBody) {
    return this.files.update(await this.owner(req), id, body);
  }

  @Post('entries/:id/copy')
  async copy(@Req() req: Request, @Param('id') id: string, @Body() body: ChangeBody) {
    return this.files.copy(await this.owner(req), id, body);
  }

  @Delete('entries/:id') @HttpCode(204)
  async trash(@Req() req: Request, @Param('id') id: string) {
    return this.files.trash(await this.owner(req), id);
  }

  @Post('entries/:id/restore')
  async restore(@Req() req: Request, @Param('id') id: string, @Body() body: ChangeBody) {
    return this.files.update(await this.owner(req), id, body, true);
  }

  @Post('entries/:id/purge') @HttpCode(202)
  async purge(@Req() req: Request, @Param('id') id: string, @Body() body: ConfirmBody) {
    await this.files.remove(await this.owner(req), id, body.confirmed);
  }

  @Post('entries/:id/process') @HttpCode(202)
  async process(@Req() req: Request, @Param('id') id: string, @Query('video') video?: string) {
    await this.files.process(await this.owner(req), id, video === '1');
  }

  @Get('entries/:id/content')
  @ApiHeader({ name: 'Range', required: false, example: 'bytes=0-1048575' })
  @ApiResponse({ status: 206, description: 'Contenido parcial con Content-Range.',
    headers: { 'Content-Range': { schema: { type: 'string', example: 'bytes 0-1048575/2097152' } } } })
  @ApiResponse({ status: 416, description: 'El rango solicitado queda fuera del archivo.' })
  async read(@Req() req: Request, @Res() res: Response, @Param('id') id: string, @Query('mode') mode = 'download') {
    await this.files.content(await this.owner(req), id, mode, req, res);
  }

  @Post('uploads')
  @ApiOperation({ summary: 'Reservar una subida por partes.' })
  @ApiCreatedResponse({ type: UploadCreated })
  async begin(@Req() req: Request, @Body() body: UploadBody) {
    return this.files.uploadStart(await this.owner(req), body);
  }

  @Get('uploads/:id')
  async status(@Req() req: Request, @Param('id') id: string) {
    return this.files.uploadStatus(await this.owner(req), id);
  }

  @Put('uploads/:id/parts/:number') @HttpCode(204)
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  async part(@Req() req: Request, @Param('id') id: string, @Param('number') number: string) {
    return this.files.uploadPart(await this.owner(req), id, Number(number), req);
  }

  @Post('uploads/:id/complete')
  async finish(@Req() req: Request, @Param('id') id: string, @Body() body: ChangeBody) {
    return this.files.uploadComplete(await this.owner(req), id, Boolean(body.overwrite));
  }

  @Delete('uploads/:id') @HttpCode(204)
  async cancel(@Req() req: Request, @Param('id') id: string) {
    return this.files.uploadCancel(await this.owner(req), id);
  }
}
