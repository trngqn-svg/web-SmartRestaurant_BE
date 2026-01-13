import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TableDocument = Table & Document;

export type TableStatus = 'active' | 'inactive'| 'occupied';

@Schema({ timestamps: true })
export class Table {
  @Prop({ required: true, unique: true })
  tableNumber: string;

  @Prop({ required: true, min: 1, max: 20 })
  capacity: number;

  @Prop()
  location: string;

  @Prop()
  description?: string;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'occupied'] })
  status: TableStatus;

  @Prop()
  qrToken?: string;

  @Prop()
  qrTokenCreatedAt?: Date;

  @Prop({default: 0})
  qrTokenVersion: number;
}

export const TableSchema = SchemaFactory.createForClass(Table);