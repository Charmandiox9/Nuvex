import { HttpException } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(code: string, message: string, status: number, extra?: Record<string, unknown>) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}
