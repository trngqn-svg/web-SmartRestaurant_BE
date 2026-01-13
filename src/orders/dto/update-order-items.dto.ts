import { Type } from 'class-transformer';
import { IsArray, IsInt, IsMongoId, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';

class ModifierDto {
  @IsMongoId() groupId: string;
  @IsArray() optionIds: string[];
}

class LineDto {
  @IsMongoId() itemId: string;
  @IsInt() @Min(1) qty: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ModifierDto)
  modifiers?: ModifierDto[];
}

export class UpdateOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  items: LineDto[];
}