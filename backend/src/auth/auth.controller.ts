import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CodeBody, LoginBody, LoginResponse, VerificationResponse } from './auth.dto';
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
}
