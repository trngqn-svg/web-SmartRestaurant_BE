import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier: string; // staff: username | user: email

  @IsString()
  @MinLength(4)
  password: string;
}
