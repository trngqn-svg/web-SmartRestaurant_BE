import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { PasswordReset, PasswordResetDocument } from './password-reset.schema';
import { UsersService } from '../../users/users.service';
import { hashPassword, hashToken, compareToken } from '../../common/utils/password.util';
import { EmailService } from '../../common/email/email.service';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function toObjectId(id: string, name = 'id') {
  try {
    return new Types.ObjectId(id);
  } catch {
    throw new BadRequestException(`Invalid ${name}`);
  }
}

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectModel(PasswordReset.name)
    private readonly model: Model<PasswordResetDocument>,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  private otpExpiresMs() {
    return Number(this.config.get<string>('RESET_OTP_EXPIRES_MS') ?? 10 * 60 * 1000);
  }

  private resendCooldownMs() {
    return Number(this.config.get<string>('RESET_OTP_COOLDOWN_MS') ?? 60 * 1000);
  }

  private resetTokenExpiresIn(): StringValue | number {
    return (this.config.get<string>('RESET_TOKEN_EXPIRES_IN') ?? '15m') as StringValue;
  }

  async forgot(rawEmail: string) {
    const email = (rawEmail ?? '').toLowerCase().trim();
    if (!email) throw new BadRequestException('Email is required');

    const user = await this.users.findByEmail(email);

    if (!user) {
      return { ok: true, message: 'If the email exists, we sent an OTP.' };
    }

    const last = await this.model
      .findOne({ userId: user._id, email })
      .sort({ createdAt: -1 })
      .lean();

    if (last?.createdAt) {
      const diff = Date.now() - new Date(last.createdAt).getTime();
      if (diff < this.resendCooldownMs()) {
        throw new BadRequestException('Please wait before requesting another OTP');
      }
    }

    const otp = generateOtp();
    const otpHash = await hashToken(otp);

    const expiresAt = new Date(Date.now() + this.otpExpiresMs());
    const rec = await this.model.create({
      userId: user._id,
      email,
      otpHash,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      resetTokenHash: null,
    });

    await this.email.sendOtpEmail(email, otp, Math.round(this.otpExpiresMs() / 60000));

    return {
      ok: true,
      message: 'If the email exists, we sent an OTP.',
      resetId: String(rec._id),
      expiresInSeconds: Math.floor(this.otpExpiresMs() / 1000),
      cooldownSeconds: Math.floor(this.resendCooldownMs() / 1000),
    };
  }

  async verifyOtp(resetId: string, otp: string) {
    const rid = toObjectId(resetId, 'resetId');

    const rec = await this.model.findById(rid);
    if (!rec) throw new UnauthorizedException('OTP invalid or expired');
    if (rec.consumedAt) throw new UnauthorizedException('OTP invalid or expired');
    if (rec.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('OTP expired');

    if (rec.attempts >= rec.maxAttempts) {
      throw new ForbiddenException('Too many attempts');
    }

    const ok = await compareToken(otp, rec.otpHash);
    if (!ok) {
      rec.attempts += 1;
      await rec.save();
      throw new BadRequestException({
        message: 'OTP invalid',
        code: 'OTP_INVALID',
        remainingAttempts: Math.max(0, rec.maxAttempts - rec.attempts),
      });
    }

    const payload: Record<string, any> = {
      sub: String(rec.userId),
      typ: 'RESET_PASSWORD',
    };

    const resetToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_RESET_SECRET')!,
      expiresIn: this.resetTokenExpiresIn(),
    });

    rec.resetTokenHash = await hashToken(resetToken);
    rec.consumedAt = new Date();
    await rec.save();

    return { ok: true, resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string, confirmPassword: string) {
    if (!resetToken) throw new UnauthorizedException('Missing reset token');
    if (!newPassword || !confirmPassword) throw new BadRequestException('Missing password');
    if (newPassword !== confirmPassword) throw new BadRequestException('Password mismatch');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(resetToken, {
        secret: this.config.get<string>('JWT_RESET_SECRET')!,
      });
    } catch {
      throw new UnauthorizedException('Reset token invalid or expired');
    }

    if (payload?.typ !== 'RESET_PASSWORD') {
      throw new UnauthorizedException('Reset token invalid');
    }

    const userId = String(payload.sub);

    const rec = await this.model
      .findOne({
        userId: new Types.ObjectId(userId),
        resetTokenHash: { $ne: null },
      })
      .sort({ createdAt: -1 });

    if (!rec?.resetTokenHash) throw new UnauthorizedException('Reset token invalid');

    const ok = await compareToken(resetToken, rec.resetTokenHash);
    if (!ok) throw new UnauthorizedException('Reset token invalid');

    const passwordHash = await hashPassword(newPassword);

    await this.users.updatePasswordHash(userId, passwordHash);
    await this.users.updateRefreshTokenHash(userId, null);

    await rec.deleteOne();

    return { ok: true };
  }
}
