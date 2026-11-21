import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginBody {
  @ApiProperty({ example: 'propietario' }) @IsString() @Length(1, 80) username!: string;
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 256) password!: string;
}

export class CodeBody {
  @ApiProperty({ writeOnly: true, example: '123456' }) @IsString() @Length(6, 32) code!: string;
}

export class LoginResponse {
  @ApiProperty({ enum: ['enroll', 'verify'] }) stage!: 'enroll' | 'verify';
  @ApiProperty({ required: false, description: 'Código QR como data URL durante el enrolamiento.' }) qr?: string;
  @ApiProperty({ required: false, description: 'Clave manual durante el enrolamiento.' }) setupKey?: string;
}

export class VerificationResponse {
  @ApiProperty({ type: [String], description: 'Códigos de un uso, devueltos únicamente en el enrolamiento.' })
  recoveryCodes!: string[];
}

export class PasswordBody {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 256) currentPassword!: string;
}

export class ChangePasswordBody {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 256) currentPassword!: string;
  @ApiProperty({ writeOnly: true, minLength: 8 }) @IsString() @Length(8, 256) newPassword!: string;
}

export class DisableBody {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 256) currentPassword!: string;
  @ApiProperty({ writeOnly: true, example: '123456' }) @IsString() @Length(6, 32) code!: string;
}

export class EnrollResponse {
  @ApiProperty({ description: 'Código QR como data URL.' }) qr!: string;
  @ApiProperty({ description: 'Clave manual del nuevo autenticador.' }) setupKey!: string;
}
