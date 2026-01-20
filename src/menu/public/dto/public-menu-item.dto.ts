import { IsString } from 'class-validator';

export class PublicMenuItemQueryDto {
  @IsString()
  table: string;

  @IsString()
  token: string;
}
