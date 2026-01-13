import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ModifierGroupDocument = HydratedDocument<ModifierGroup>;
export type SelectionType = 'single' | 'multiple';
export type ModStatus = 'active' | 'inactive';

@Schema({ timestamps: true })
export class ModifierGroup {
  @Prop({ required: true })
  restaurantId: string;

  @Prop({ required: true, minlength: 2, maxlength: 80 })
  name: string;

  @Prop({ required: true, enum: ['single', 'multiple'] })
  selectionType: SelectionType;

  @Prop({ default: false })
  isRequired: boolean;

  @Prop({ default: 0, min: 0 })
  minSelections: number;

  @Prop({ default: 0, min: 0 })
  maxSelections: number;

  @Prop({ default: 0, min: 0 })
  displayOrder: number;

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: ModStatus;
}

export const ModifierGroupSchema = SchemaFactory.createForClass(ModifierGroup);

ModifierGroupSchema.index({ restaurantId: 1, name: 1 }, { unique: true });
ModifierGroupSchema.index({ restaurantId: 1, status: 1 });