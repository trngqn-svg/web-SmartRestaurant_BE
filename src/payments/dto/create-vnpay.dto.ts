import { IsNotEmpty, IsString } from 'class-validator';

export class CreateVnpayDto {
  @IsString()
  @IsNotEmpty()
  billId: string;
}
