import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PasswordReset {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, required: true })
  otpHash: string;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Number, default: 5 })
  maxAttempts: number;

  @Prop({ type: Date, default: null })
  consumedAt: Date | null;

  @Prop({ type: String, default: null })
  resetTokenHash: string | null;
}

export type PasswordResetDocument = HydratedDocument<PasswordReset> & {
  createdAt: Date;
  updatedAt: Date;
};

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset);

PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
