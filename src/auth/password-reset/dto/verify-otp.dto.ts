import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  resetId: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
