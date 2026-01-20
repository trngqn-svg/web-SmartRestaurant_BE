import { IsOptional, IsString, Length, MaxLength, Matches } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+\-\s]{6,30}$/)
  phoneNumber?: string | null;
}
