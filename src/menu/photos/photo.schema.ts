import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type MenuItemPhotoDocument = HydratedDocument<MenuItemPhoto>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class MenuItemPhoto {
  @Prop({ type: Types.ObjectId, required: true, ref: 'MenuItem' })
  menuItemId: Types.ObjectId;

  @Prop({ required: true })
  url: string;

  @Prop({ default: false })
  isPrimary: boolean;
}

export const MenuItemPhotoSchema = SchemaFactory.createForClass(MenuItemPhoto);

MenuItemPhotoSchema.index({ menuItemId: 1, createdAt: -1 });
MenuItemPhotoSchema.index(
  { menuItemId: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true } },
);
