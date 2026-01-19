import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type BillDocument = HydratedDocument<Bill>;
export type BillStatus = 'REQUESTED' | 'PAYMENT_PENDING' | 'PAID' | 'CANCELLED';
export type BillMethod = 'CASH' | 'ONLINE';

@Schema({ timestamps: true })
export class Bill {
  @Prop({ required: true, index: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, index: true })
  sessionKey: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tableId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  orderIds: Types.ObjectId[];

  @Prop({ required: true })
  tableNumberSnapshot: string;

  @Prop({
    required: true,
    enum: ['REQUESTED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED'],
    index: true,
    default: 'REQUESTED',
  })
  status: BillStatus;

  @Prop({ required: true, min: 0 })
  totalCents: number;

  @Prop({ default: '' })
  note?: string;

  @Prop({ enum: ['CASH', 'ONLINE'] })
  method?: BillMethod;

  @Prop({ enum: ['USER', 'ACCOUNT'], index: true })
  customerSubjectType?: 'USER' | 'ACCOUNT';

  @Prop({ index: true })
  customerSubjectId?: string;

  @Prop()
  requestedAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  cancelledAt?: Date;
}

export const BillSchema = SchemaFactory.createForClass(Bill);

BillSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
BillSchema.index({ restaurantId: 1, sessionId: 1, createdAt: -1 });
BillSchema.index({ restaurantId: 1, tableId: 1, status: 1, createdAt: -1 });
BillSchema.index({ restaurantId: 1, customerSubjectType: 1, customerSubjectId: 1, createdAt: -1 });
BillSchema.index({ restaurantId: 1, status: 1, paidAt: -1 });

