import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

@Schema({ timestamps: true, collection: 'accounts' })
export class Account {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, enum: ['SUPER_ADMIN', 'ADMIN', 'WAITER', 'KDS'] })
  role: string;

  @Prop({ type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status: 'ACTIVE'| 'DISABLED';

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
