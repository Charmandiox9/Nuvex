import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

export class Input {
  @ApiProperty({ description: 'Objeto JSON, arreglo o cadena de entrada.' }) @IsDefined() json!: unknown;
}
export class Candidate {
  @ApiProperty() @IsString() @Length(1, 2048) url!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(1, 200) name?: string;
}
export class Batch {
  @ApiProperty({ required: false }) @IsString() @Length(0, 36) parentId = '';
  @ApiProperty({ type: [Candidate] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => Candidate) items!: Candidate[];
}
export class ApiKey {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(10, 250) key!: string;
}
export class Suggestion {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30)
  @IsString({ each: true }) @Length(1, 2048, { each: true }) urls!: string[];
}
