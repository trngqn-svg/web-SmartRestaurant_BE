import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<UserDocument>) {}

  create(data: Partial<User>) {
    return this.model.create(data);
  }

  findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase() }).exec();
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
    const email = input.email.trim();

    let user = await this.model.findOne({ googleId: input.googleId }).exec();
    if (user) return user;

    user = await this.model.findOne({ email }).exec();
    if (user) {
      user.googleId = input.googleId as any;
      if (!user.fullName && input.fullName) user.fullName = input.fullName;
      await user.save();
      return user;
    }

    return this.model.create({
      email,
      fullName: input.fullName ?? '',
      googleId: input.googleId as any,
      role: 'USER',
      status: 'ACTIVE',
    });
  }
}
