import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { maxFileSize, partSize } from '../storage/storage';

export class FolderBody {
  @ApiProperty({ example: 'Fotos' }) @IsString() @Length(1, 200) name!: string;
  @ApiProperty({ required: false }) @IsString() @Length(0, 36) parentId = '';
}
export class UploadBody extends FolderBody {
  @ApiProperty({ example: 'image/jpeg' }) @IsString() @Length(1, 120) mime!: string;
  @ApiProperty({ maximum: maxFileSize }) @IsInt() @Min(0) @Max(maxFileSize) size!: number;
  @ApiProperty() @IsString() @Length(1, 128) fingerprint!: string;
  @ApiProperty({ required: false }) @IsBoolean() overwrite = false;
}
export class ChangeBody {
  @ApiProperty({ required: false }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Length(1, 200) name?: string;
  @ApiProperty({ required: false }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Length(0, 36) parentId?: string;
  @ApiProperty({ required: false }) @IsBoolean() overwrite = false;
}
export class ConfirmBody {
  @ApiProperty() @IsBoolean() confirmed!: boolean;
}

export class UploadCreated {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: partSize, description: 'Tamaño de parte en bytes, salvo la última.' }) partSize!: number;
}
