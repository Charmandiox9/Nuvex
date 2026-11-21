import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ChangePasswordBody, CodeBody, DisableBody, LoginBody, LoginResponse, PasswordBody, VerificationResponse } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Cuenta')
@ApiCookieAuth('owner')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') @HttpCode(200)
  @ApiOperation({ security: [] })
  @ApiOkResponse({ type: LoginResponse, description: 'Crea la cookie de sesión pendiente.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas.' })
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: LoginBody) {
    return this.auth.login(req, res, body);
  }

  @Post('totp') @HttpCode(200)
  @ApiOkResponse({ type: VerificationResponse, description: 'Rota la cookie a una sesión verificada.' })
  totp(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: CodeBody) {
    return this.auth.verify(req, res, body.code, false);
  }

  @Post('recovery') @HttpCode(200)
  @ApiOkResponse({ type: VerificationResponse, description: 'Consume el código y crea una sesión verificada.' })
  recovery(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: CodeBody) {
    return this.auth.verify(req, res, body.code, true);
  }

  @Get('me')
  async me(@Req() req: Request) {
    await this.auth.session(req);
    return { authenticated: true };
  }

  @Get('sessions')
  sessions(@Req() req: Request) {
    return this.auth.sessions(req);
  }

  @Delete('sessions/:id') @HttpCode(204)
  revoke(@Req() req: Request, @Param('id') id: string) {
    return this.auth.revoke(req, id);
  }

  @Post('logout') @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Post('password') @HttpCode(204)
  changePassword(@Req() req: Request, @Body() body: ChangePasswordBody) {
    return this.auth.changePassword(req, body);
  }

  @Post('recovery/regenerate') @HttpCode(200)
  regenerate(@Req() req: Request, @Body() body: PasswordBody) {
    return this.auth.regenerateRecovery(req, body);
  }

  @Post('totp/enroll') @HttpCode(200)
  enroll(@Req() req: Request, @Body() body: PasswordBody) {
    return this.auth.beginTotpEnroll(req, body);
  }

  @Post('totp/confirm') @HttpCode(200)
  confirm(@Req() req: Request, @Body() body: CodeBody) {
    return this.auth.confirmTotp(req, body);
  }

  @Post('2fa/disable') @HttpCode(204)
  disable(@Req() req: Request, @Body() body: DisableBody) {
    return this.auth.disableTotp(req, body);
  }

  @Post('sessions/revoke-all') @HttpCode(200)
  revokeAll(@Req() req: Request) {
    return this.auth.revokeAllSessions(req);
  }
}
