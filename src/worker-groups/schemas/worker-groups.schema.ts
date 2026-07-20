import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WorkerGroupDocument = WorkerGroup & Document;

@Schema({ timestamps: true })
export class WorkerGroup {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ default: 0 })
  display_order!: number;
}

export const WorkerGroupSchema = SchemaFactory.createForClass(WorkerGroup);

WorkerGroupSchema.index({ display_order: 1, name: 1 });
