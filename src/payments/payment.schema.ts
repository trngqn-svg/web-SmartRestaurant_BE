import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;
export type PaymentProvider = 'VNPAY';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true, index: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  billId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tableId: Types.ObjectId;

  @Prop({ required: true, enum: ['VNPAY'], index: true, default: 'VNPAY' })
  provider: PaymentProvider;

  @Prop({ required: true, unique: true, index: true })
  txnRef: string;

  @Prop({ required: true, min: 1 })
  amountVnd: number;

  @Prop({ required: true, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING', index: true })
  status: PaymentStatus;

  @Prop()
  vnpTransactionNo?: string;

  @Prop()
  vnpResponseCode?: string;

  @Prop({ type: Object })
  rawCreateParams?: any;

  @Prop({ type: Object })
  rawReturnParams?: any;

  @Prop({ type: Object })
  rawIpnParams?: any;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ restaurantId: 1, provider: 1, createdAt: -1 });
PaymentSchema.index({ restaurantId: 1, billId: 1, createdAt: -1 });
PaymentSchema.index({ restaurantId: 1, sessionId: 1, createdAt: -1 });
PaymentSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
