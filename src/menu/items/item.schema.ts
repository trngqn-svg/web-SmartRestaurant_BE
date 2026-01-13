import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type MenuItemDocument = HydratedDocument<MenuItem>;
export type ItemStatus = 'available' | 'unavailable' | 'sold_out';

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class MenuItem {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'MenuCategory' })
  categoryId: Types.ObjectId;

  @Prop({ required: true, minlength: 2, maxlength: 80 })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 1, max: 99999900 })
  priceCents: number;

  @Prop({ default: 0, min: 0, max: 240 })
  prepTimeMinutes: number;

  @Prop({ required: true, enum: ['available', 'unavailable', 'sold_out'] })
  status: ItemStatus;

  @Prop({ default: false })
  isChefRecommended: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: 0, min: 0 })
  popularityCount: number;

  @Prop({ type: [Types.ObjectId], ref: 'ModifierGroup', default: [] })
  modifierGroupIds: Types.ObjectId[];

  @Prop({ default: 0, min: 0, max: 5 })
  ratingAvg: number;

  @Prop({ default: 0, min: 0 })
  ratingCount: number;

  @Prop({
    type: Object,
    default: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })
  ratingBreakdown: Record<'1'|'2'|'3'|'4'|'5', number>;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

MenuItemSchema.index({ restaurantId: 1, categoryId: 1 });
MenuItemSchema.index({ restaurantId: 1, status: 1 });
MenuItemSchema.index({ restaurantId: 1, createdAt: -1 });
MenuItemSchema.index({ restaurantId: 1, priceCents: 1 });
MenuItemSchema.index({ restaurantId: 1, popularityCount: -1 });
MenuItemSchema.index({ restaurantId: 1, name: 1 });
MenuItemSchema.index({ restaurantId: 1, ratingAvg: -1 });
MenuItemSchema.index({ restaurantId: 1, ratingCount: -1 });