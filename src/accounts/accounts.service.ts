import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Account, AccountDocument } from './account.schema';

@Injectable()
export class AccountsService {
  constructor(@InjectModel(Account.name) private readonly model: Model<AccountDocument>) {}

  findByUsername(username: string) {
    return this.model.findOne({ username }).exec();
  }

  findById(id: string) {
    return this.model.findById(id).exec();
  }

  updateRefreshTokenHash(id: string, refreshTokenHash: string | null) {
    return this.model.findByIdAndUpdate(id, { refreshTokenHash }, { new: true }).exec();
  }
}
