import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';

export class ShareBody {
  @ApiProperty() @IsString() @Length(1, 36) entryId!: string;
  @ApiProperty({ default: 24 }) @IsInt() @Min(1) @Max(720) hours = 24;
  @ApiProperty({ default: 1 }) @IsInt() @Min(1) @Max(100) uses = 1;
  @ApiProperty({ default: false }) @IsBoolean() allowDownload = false;
}
export class RedeemBody {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(6, 32) code!: string;
}
