import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from 'src/users/schemas/users.schema';
import { Worker } from 'src/workers/schemas/workers.schema';

export type WorkerUnavailabilityDocument = WorkerUnavailability & Document;

@Schema({ timestamps: true, collection: 'worker_unavailability' })
export class WorkerUnavailability {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Worker.name, required: true })
  worker_id!: Types.ObjectId;

  @Prop({ required: true })
  date!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WorkerRequest', required: true })
  source_request_id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  created_by!: Types.ObjectId;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name })
  revoked_by?: Types.ObjectId;

  @Prop()
  revoked_at?: Date;

  @Prop({ trim: true })
  revocation_note?: string;
}

export const WorkerUnavailabilitySchema =
  SchemaFactory.createForClass(WorkerUnavailability);

WorkerUnavailabilitySchema.index({ worker_id: 1, date: 1 }, { unique: true });
WorkerUnavailabilitySchema.index({ date: 1, is_active: 1 });
