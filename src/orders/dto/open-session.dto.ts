import { IsMongoId, IsString, MinLength } from 'class-validator';

export class OpenSessionQueryDto {
  @IsMongoId()
  table: string;

  @IsString()
  @MinLength(10)
  token: string;
}
