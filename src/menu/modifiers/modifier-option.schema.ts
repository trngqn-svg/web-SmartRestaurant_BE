import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type ModifierOptionDocument = HydratedDocument<ModifierOption>;
export type ModStatus = 'active' | 'inactive';

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class ModifierOption {
  @Prop({ type: Types.ObjectId, required: true, ref: 'ModifierGroup' })
  groupId: Types.ObjectId;

  @Prop({ required: true, minlength: 1, maxlength: 80 })
  name: string;

  @Prop({ default: 0, min: 0, max: 99999900 })
  priceAdjustmentCents: number;

  @Prop({ default: 0, min: 0 })
  displayOrder: number;

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: ModStatus;
}

export const ModifierOptionSchema = SchemaFactory.createForClass(ModifierOption);

ModifierOptionSchema.index({ groupId: 1, name: 1 }, { unique: true });
ModifierOptionSchema.index({ groupId: 1, displayOrder: 1 });
