import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MenuCategoryDocument = HydratedDocument<MenuCategory>;

export type CategoryStatus = 'active' | 'inactive';

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class MenuCategory {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ required: true, minlength: 2, maxlength: 50 })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: 0, min: 0 })
  displayOrder: number;

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: CategoryStatus;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);

MenuCategorySchema.index({ restaurantId: 1, name: 1 }, { unique: true });
MenuCategorySchema.index({ restaurantId: 1, status: 1 });
MenuCategorySchema.index({ restaurantId: 1, displayOrder: 1, name: 1, createdAt: -1 });
