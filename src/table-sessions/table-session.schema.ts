import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TableSessionDocument = HydratedDocument<TableSession>;

export type TableSessionStatus =
  | 'OPEN'
  | 'BILL_REQUESTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CLOSED';

@Schema({ timestamps: true })
export class TableSession {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tableId: Types.ObjectId;

  @Prop({ required: true })
  tableNumberSnapshot: string;

  @Prop({ required: true, unique: true, index: true })
  sessionKey: string;

  @Prop({
    required: true,
    enum: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'],
    index: true,
    default: 'OPEN',
  })
  status: TableSessionStatus;

  @Prop()
  openedAt?: Date;

  @Prop()
  billRequestedAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  closedAt?: Date;

  @Prop({ type: Types.ObjectId, default: null })
  activeBillId?: Types.ObjectId | null;
}

export const TableSessionSchema = SchemaFactory.createForClass(TableSession);
TableSessionSchema.index({ restaurantId: 1, tableId: 1, status: 1, createdAt: -1 });
