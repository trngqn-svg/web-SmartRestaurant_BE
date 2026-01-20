import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<UserDocument>) {}

  create(data: Partial<User>) {
    const email = data.email ? normalizeEmail(data.email) : undefined;
    return this.model.create({
      ...data,
      email,
      avatarUrl: data.avatarUrl ?? '/uploads/avatars/default.png',
      address: typeof data.address === 'undefined' ? null : data.address,
      phoneNumber: typeof data.phoneNumber === 'undefined' ? null : data.phoneNumber,
      fullName: data.fullName ?? '',
    });
  }

  findByEmail(email: string) {
    return this.model.findOne({ email: normalizeEmail(email) }).exec();
  }

  findById(id: string) {
    return this.model.findById(id).exec();
  }

  updateRefreshTokenHash(id: string, refreshTokenHash: string | null) {
    return this.model.findByIdAndUpdate(id, { refreshTokenHash }, { new: true }).exec();
  }

  async findOrCreateByGoogle(input: {
    email: string;
    fullName?: string;
    googleId: string;
  }): Promise<UserDocument> {
    const email = normalizeEmail(input.email);

    let user = await this.model.findOne({ googleId: input.googleId }).exec();
    if (user) return user;

    user = await this.model.findOne({ email }).exec();
    if (user) {
      user.googleId = input.googleId as any;
      if (!user.fullName && input.fullName) user.fullName = input.fullName;
      if (!user.avatarUrl) user.avatarUrl = '/uploads/avatars/default.png';
      if (typeof user.address === 'undefined') user.address = null as any;
      if (typeof user.phoneNumber === 'undefined') user.phoneNumber = null as any;
      await user.save();
      return user;
    }

    return this.model.create({
      email,
      fullName: input.fullName ?? '',
      googleId: input.googleId as any,
      role: 'USER',
      status: 'ACTIVE',
      password: null,
      avatarUrl: '/uploads/avatars/default.png',
      address: null,
      phoneNumber: null,
    });
  }

  updatePasswordHash(id: string, passwordHash: string) {
    return this.model
      .findByIdAndUpdate(id, { password: passwordHash }, { new: true })
      .exec();
  }

  async getMe(userId: string) {
    const u = await this.model.findById(userId).lean();
    if (!u) throw new NotFoundException('User not found');

    return this.toMe(u);
  }

  async updateMe(userId: string, patch: { fullName?: string; address?: string | null; phoneNumber?: string | null }) {
    const u = await this.model
      .findByIdAndUpdate(
        userId,
        {
          ...(typeof patch.fullName !== 'undefined' ? { fullName: patch.fullName } : {}),
          ...(typeof patch.address !== 'undefined' ? { address: patch.address } : {}),
          ...(typeof patch.phoneNumber !== 'undefined' ? { phoneNumber: patch.phoneNumber } : {}),
        },
        { new: true },
      )
      .lean();

    if (!u) throw new NotFoundException('User not found');
    return this.toMe(u);
  }

  async setAvatarUrl(userId: string, avatarUrl: string) {
    const u = await this.model.findByIdAndUpdate(userId, { avatarUrl }, { new: true }).lean();
    if (!u) throw new NotFoundException('User not found');
    return this.toMe(u);
  }

  // ======= NEW: PASSWORD =======

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const u = await this.model.findById(userId).exec();
    if (!u) throw new NotFoundException('User not found');

    if (!u.password) {
      // user google chưa set password
      throw new ForbiddenException('Account does not have password. Use set-password first.');
    }

    const ok = await bcrypt.compare(oldPassword, u.password);
    if (!ok) throw new BadRequestException('Old password is incorrect');

    const same = await bcrypt.compare(newPassword, u.password);
    if (same) throw new BadRequestException('New password must be different');

    const hash = await bcrypt.hash(newPassword, 10);
    u.password = hash;
    await u.save();

    return { ok: true };
  }

  async setPassword(userId: string, newPassword: string) {
    const u = await this.model.findById(userId).exec();
    if (!u) throw new NotFoundException('User not found');

    if (u.password) throw new BadRequestException('Password already set. Use change-password.');

    const hash = await bcrypt.hash(newPassword, 10);
    u.password = hash;
    await u.save();

    return { ok: true };
  }

  private toMe(u: any) {
    return {
      _id: String(u._id),
      email: u.email,
      fullName: u.fullName ?? '',
      avatarUrl: u.avatarUrl ?? '/uploads/avatars/default.png',
      address: typeof u.address === 'undefined' ? null : u.address,
      phoneNumber: typeof u.phoneNumber === 'undefined' ? null : u.phoneNumber,
      status: u.status,
      hasPassword: !!u.password,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
