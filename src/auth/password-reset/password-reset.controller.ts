import { Body, Controller, Post } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('/api/auth/password')
export class PasswordResetController {
  constructor(private readonly svc: PasswordResetService) {}

  @Post('/forgot')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.svc.forgot(dto.email);
  }

  @Post('/verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.svc.verifyOtp(dto.resetId, dto.otp);
  }

  @Post('/reset')
  reset(@Body() dto: ResetPasswordDto) {
    return this.svc.resetPassword(
      dto.resetToken,
      dto.newPassword,
      dto.confirmPassword,
    );
  }
}
