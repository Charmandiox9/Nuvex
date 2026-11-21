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

class StorageVolume {
  @ApiProperty({ type: String, example: '53687091200' }) availableBytes!: string;
  @ApiProperty({ type: String, example: '107374182400' }) totalBytes!: string;
  @ApiProperty({ type: String, format: 'date-time' }) measuredAt!: string;
}

class LargeFile {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, example: '1048576' }) size!: string;
}

export class StorageOverview {
  @ApiProperty({ type: String }) used!: string;
  @ApiProperty({ type: String }) quota!: string;
  @ApiProperty({ type: String }) trashBytes!: string;
  @ApiProperty({ type: StorageVolume, nullable: true }) volume!: StorageVolume | null;
  @ApiProperty({ type: [LargeFile], maxItems: 10 }) largestFiles!: LargeFile[];
}
