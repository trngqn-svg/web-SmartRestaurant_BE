import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type ItemReviewDocument = HydratedDocument<ItemReview>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class ItemReview {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'MenuItem', index: true })
  itemId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  orderId?: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ maxlength: 1000 })
  comment?: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ItemReviewSchema = SchemaFactory.createForClass(ItemReview);

ItemReviewSchema.index({ restaurantId: 1, itemId: 1, createdAt: -1 });
ItemReviewSchema.index({ restaurantId: 1, itemId: 1, rating: -1 });
ItemReviewSchema.index({ restaurantId: 1, userId: 1, createdAt: -1 });