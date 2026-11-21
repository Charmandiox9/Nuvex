import { BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import type { Request, Response } from 'express';
import { digest, seal, secretHash, token, unseal } from '../common/security';
import { Database } from '../database/database.service';
import type { ChangePasswordBody, CodeBody, DisableBody, LoginBody, PasswordBody } from './auth.dto';
import { cookieOptions } from './session-cookie';

const sessionCookie = 'nuvex_session';
const pendingMs = 5 * 60_000;
const sessionMs = 12 * 60 * 60_000;

@Injectable()
export class AuthService {
  private readonly dummyHash = hash(token());
  constructor(private readonly db: Database) {}

  async limit(scope: string, identity: string, maximum: number) {
    const interval = 10 * 60_000;
    const window = Math.floor(Date.now() / interval);
    const key = digest([scope, identity, window].join(':'));
    const count = await this.db.client.rateLimit.upsert({
      where: { key }, create: { key, hits: 1, expiresAt: new Date((window + 1) * interval) },
      update: { hits: { increment: 1 } },
    });
    if (count.hits > maximum) throw new HttpException('Demasiados intentos. Vuelve a intentarlo más tarde.', 429);
  }

  async session(req: Request, verified = true) {
    const raw: unknown = req.cookies[sessionCookie];
    if (typeof raw !== 'string') throw new UnauthorizedException('Inicia sesión para continuar.');
    const result = await this.db.client.session.findUnique({ where: { tokenHash: digest(raw) } });
    if (!result || result.expiresAt <= new Date() || result.verified !== verified) {
      throw new UnauthorizedException('La sesión no está disponible.');
    }
    return result;
  }

  async login(req: Request, res: Response, body: LoginBody) {
    const username = body.username.trim().normalize('NFKC').toLowerCase();
    await this.limit('login-ip', req.ip ?? '', 30);
    await this.limit('login-account', username, 12);
    const owner = await this.db.client.owner.findUnique({ where: { username } });
    const valid = await verify(owner?.passwordHash ?? await this.dummyHash, body.password);
    if (!valid || !owner) throw new UnauthorizedException('Usuario o contraseña incorrectos.');

    const raw = token();
    const authenticator = owner.totpSecret ? undefined : new TOTP({
      issuer: 'Nuvex', label: username, secret: new Secret({ size: 20 }),
    });
    await this.db.client.session.create({ data: {
      tokenHash: digest(raw), ownerId: owner.id, expiresAt: new Date(Date.now() + pendingMs),
      enrollment: authenticator ? seal(authenticator.secret.base32) : null,
    } });
    res.cookie(sessionCookie, raw, { ...cookieOptions(), maxAge: pendingMs });
    return {
      stage: authenticator ? 'enroll' : 'verify',
      qr: authenticator ? await QRCode.toDataURL(authenticator.toString()) : undefined,
      setupKey: authenticator?.secret.base32,
    };
  }

  async verify(req: Request, res: Response, input: string, recovery: boolean) {
    const pending = await this.session(req, false);
    await this.limit('second-factor', pending.ownerId, 12);
    const raw = token();
    const codes = await this.db.client.$transaction(async (tx) => {
      const owner = await tx.owner.findUniqueOrThrow({ where: { id: pending.ownerId } });
      const invalid = () => new UnauthorizedException('Código inválido o ya utilizado.');
      let codes: string[] = [];
      const storedSecret = owner.totpSecret ?? pending.enrollment;
      if (recovery) {
        const current = secretHash(owner.id, input.trim().toUpperCase());
        if (!owner.recoveryHashes.includes(current)) throw invalid();
        const changed = await tx.owner.updateMany({
          where: { id: owner.id, recoveryHashes: { equals: owner.recoveryHashes } },
          data: { recoveryHashes: owner.recoveryHashes.filter((item) => item !== current) },
        });
        if (!changed.count) throw invalid();
      } else {
        if (!storedSecret || (pending.enrollment && owner.totpSecret)) throw invalid();
        const timestamp = Date.now();
        const totp = new TOTP({ secret: Secret.fromBase32(unseal(storedSecret)) });
        const delta = totp.validate({ token: input.trim(), window: 1, timestamp });
        if (delta === null) throw invalid();
        const step = BigInt(Math.floor(timestamp / 30_000) + delta);
        if (pending.enrollment) {
          codes = Array.from({ length: 10 }, () => token(10).toUpperCase());
        }
        const changed = await tx.owner.updateMany({
          where: { id: owner.id, lastTotpStep: { lt: step }, totpSecret: owner.totpSecret },
          data: {
            lastTotpStep: step, totpSecret: storedSecret,
            ...(codes.length ? { recoveryHashes: codes.map((code) => secretHash(owner.id, code)) } : {}),
          },
        });
        if (!changed.count) throw invalid();
      }
      const consumed = await tx.session.deleteMany({ where: {
        tokenHash: pending.tokenHash, expiresAt: { gt: new Date() }, verified: false,
      } });
      if (!consumed.count) throw invalid();
      await tx.session.create({ data: {
        tokenHash: digest(raw), ownerId: owner.id, expiresAt: new Date(Date.now() + sessionMs), verified: true,
      } });
      await tx.audit.create({ data: { ownerId: owner.id, action: recovery ? 'auth.recovery' : 'auth.verified' } });
      return codes;
    });
    res.cookie(sessionCookie, raw, { ...cookieOptions(), maxAge: sessionMs });
    return { recoveryCodes: codes };
  }

  async logout(req: Request, res: Response) {
    const raw: unknown = req.cookies[sessionCookie];
    if (typeof raw === 'string') await this.db.client.session.deleteMany({ where: { tokenHash: digest(raw) } });
    res.clearCookie(sessionCookie, cookieOptions());
  }

  async sessions(req: Request) {
    const current = await this.session(req);
    const rows = await this.db.client.session.findMany({
      where: { ownerId: current.ownerId, verified: true, expiresAt: { gt: new Date() } },
      select: { tokenHash: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ tokenHash, ...row }) => ({ ...row, id: tokenHash, current: tokenHash === current.tokenHash }));
  }

  async revoke(req: Request, id: string) {
    const current = await this.session(req);
    if (id !== current.tokenHash) await this.db.client.session.deleteMany({ where: { tokenHash: id, ownerId: current.ownerId } });
  }

  private async currentOwner(req: Request) {
    return this.db.client.owner.findUniqueOrThrow({ where: { id: (await this.session(req)).ownerId } });
  }

  private async requirePassword(owner: { id: string; passwordHash: string }, password: string) {
    if (!(await verify(owner.passwordHash, password))) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }
  }

  async changePassword(req: Request, input: ChangePasswordBody) {
    const owner = await this.currentOwner(req);
    await this.limit('account-password', owner.id, 10);
    await this.requirePassword(owner, input.currentPassword);
    const passwordHash = await hash(input.newPassword);
    const current = await this.session(req);
    await this.db.client.$transaction(async (tx) => {
      await tx.owner.update({ where: { id: owner.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { ownerId: owner.id, tokenHash: { not: current.tokenHash } } });
      await tx.audit.create({ data: { ownerId: owner.id, action: 'auth.password.changed' } });
    });
  }

  async regenerateRecovery(req: Request, input: PasswordBody) {
    const owner = await this.currentOwner(req);
    await this.limit('account-recovery', owner.id, 10);
    await this.requirePassword(owner, input.currentPassword);
    const codes = Array.from({ length: 10 }, () => token(10).toUpperCase());
    await this.db.client.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: owner.id },
        data: { recoveryHashes: codes.map((code) => secretHash(owner.id, code)) },
      });
      await tx.audit.create({ data: { ownerId: owner.id, action: 'auth.recovery.regenerated' } });
    });
    return { recoveryCodes: codes };
  }

  async beginTotpEnroll(req: Request, input: PasswordBody) {
    const owner = await this.currentOwner(req);
    await this.limit('account-totp', owner.id, 10);
    await this.requirePassword(owner, input.currentPassword);
    const authenticator = new TOTP({ issuer: 'Nuvex', label: owner.username, secret: new Secret({ size: 20 }) });
    const current = await this.session(req);
    await this.db.client.session.update({
      where: { tokenHash: current.tokenHash },
      data: { enrollment: seal(authenticator.secret.base32) },
    });
    return { qr: await QRCode.toDataURL(authenticator.toString()), setupKey: authenticator.secret.base32 };
  }

  async confirmTotp(req: Request, input: CodeBody) {
    const current = await this.session(req);
    if (!current.enrollment) throw new BadRequestException('No hay un enrolamiento pendiente.');
    await this.limit('account-totp-confirm', current.ownerId, 10);
    const timestamp = Date.now();
    const delta = new TOTP({ secret: Secret.fromBase32(unseal(current.enrollment)) })
      .validate({ token: input.code.trim(), window: 1, timestamp });
    if (delta === null) throw new UnauthorizedException('Código inválido.');
    const step = BigInt(Math.floor(timestamp / 30_000) + delta);
    const codes = Array.from({ length: 10 }, () => token(10).toUpperCase());
    await this.db.client.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: current.ownerId },
        data: {
          totpSecret: current.enrollment, lastTotpStep: step,
          recoveryHashes: codes.map((code) => secretHash(current.ownerId, code)),
        },
      });
      await tx.session.update({ where: { tokenHash: current.tokenHash }, data: { enrollment: null } });
      await tx.audit.create({ data: { ownerId: current.ownerId, action: 'auth.totp.enrolled' } });
    });
    return { recoveryCodes: codes };
  }

  async disableTotp(req: Request, input: DisableBody) {
    const owner = await this.currentOwner(req);
    await this.limit('account-2fa', owner.id, 10);
    await this.requirePassword(owner, input.currentPassword);
    if (!owner.totpSecret) throw new BadRequestException('La verificación en dos pasos no está activa.');
    const delta = new TOTP({ secret: Secret.fromBase32(unseal(owner.totpSecret)) })
      .validate({ token: input.code.trim(), window: 1, timestamp: Date.now() });
    if (delta === null) throw new UnauthorizedException('Código inválido.');
    await this.db.client.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: owner.id },
        data: { totpSecret: null, recoveryHashes: [], lastTotpStep: BigInt(0) },
      });
      await tx.audit.create({ data: { ownerId: owner.id, action: 'auth.totp.disabled' } });
    });
  }

  async revokeAllSessions(req: Request) {
    const current = await this.session(req);
    const result = await this.db.client.session.deleteMany({
      where: { ownerId: current.ownerId, tokenHash: { not: current.tokenHash } },
    });
    await this.db.client.audit.create({ data: { ownerId: current.ownerId, action: 'auth.sessions.revoked' } });
    return { revoked: result.count };
  }
}
