import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: false, default: null })
  password: string | null;

  @Prop({ default: 'USER', enum: ['USER'] })
  role: 'USER';

  @Prop({ type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status: 'ACTIVE'| 'DISABLED';

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;

  @Prop({ type: String, default: null, unique: true, sparse: true, index: true })
  googleId: string | null;

  // optional profile fields
  @Prop({ default: '' })
  fullName?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
