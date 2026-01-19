import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'ready_to_service'
  | 'served'
  | 'cancelled';

export type OrderLineStatus = 'queued' | 'preparing' | 'ready' | 'served' | 'cancelled';

@Schema({ _id: false })
export class OrderItemModifier {
  @Prop({ type: Types.ObjectId, required: true })
  groupId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  optionIds: Types.ObjectId[];

  @Prop({ default: 0 })
  priceAdjustmentCents: number;
}

@Schema()
export class OrderLine {
  @Prop({ type: Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  nameSnapshot: string;

  @Prop({ required: true })
  unitPriceCentsSnapshot: number;

  @Prop({ required: true, min: 1 })
  qty: number;

  @Prop({ type: [OrderItemModifier], default: [] })
  modifiers: OrderItemModifier[];

  @Prop({ default: '' })
  note?: string;

  @Prop({ required: true })
  lineTotalCents: number;

  @Prop({
    required: true,
    enum: ['queued', 'preparing', 'ready', 'served', 'cancelled'],
    default: 'queued',
    index: true,
  })
  status: OrderLineStatus;

  @Prop() 
  startedAt?: Date;

  @Prop() 
  readyAt?: Date;

  @Prop() 
  servedAt?: Date;
  
  @Prop() 
  cancelledAt?: Date;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tableId: Types.ObjectId;

  @Prop({ required: true })
  tableNumberSnapshot: string;

  @Prop({ required: true, enum: ['draft','pending','accepted','preparing','ready','ready_to_service','served','cancelled'], index: true })
  status: OrderStatus;

  @Prop({ type: [OrderLine], default: [] })
  items: OrderLine[];

  @Prop({ default: 0 })
  subtotalCents: number;

  @Prop({ default: 0 })
  totalCents: number;

  @Prop({ required: true, index: true })
  sessionKey: string;

  @Prop()
  submittedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()  
  updatedAt?: Date;

  @Prop({ default: '' })
  orderNote?: string;

  @Prop({ type: Types.ObjectId, index: true })
  sessionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  billId?: Types.ObjectId;

  @Prop()
  billedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, tableId: 1, status: 1 });
OrderSchema.index({ restaurantId: 1, status: 1, submittedAt: -1 });
OrderSchema.index({ restaurantId: 1, tableId: 1, submittedAt: -1 });
OrderSchema.index({ restaurantId: 1, tableNumberSnapshot: 1 });