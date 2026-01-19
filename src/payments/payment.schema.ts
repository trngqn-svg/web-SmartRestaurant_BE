import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export type PaymentProvider = 'mock' | 'vnpay';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  billId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, enum: ['mock', 'vnpay'], index: true })
  provider: PaymentProvider;

  @Prop({ required: true, enum: ['pending', 'succeeded', 'failed'], index: true, default: 'pending' })
  status: PaymentStatus;

  @Prop({ required: true })
  amountCents: number;

  // URL để FE redirect (mock: /mock-pay?... ; vnpay: URL vnpay)
  @Prop()
  checkoutUrl?: string;

  @Prop()
  providerRef?: string;

  @Prop()
  succeededAt?: Date;

  @Prop()
  failedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// helpful indexes
PaymentSchema.index({ restaurantId: 1, billId: 1, provider: 1, createdAt: -1 });
PaymentSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
