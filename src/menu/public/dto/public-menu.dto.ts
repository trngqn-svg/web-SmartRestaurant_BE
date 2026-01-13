import { IsMongoId, IsString } from 'class-validator';

export class PublicMenuQueryDto {
  @IsMongoId()
  table: string;

  @IsString()
  token: string;
}
