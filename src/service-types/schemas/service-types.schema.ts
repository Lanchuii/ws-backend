import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerGroup } from 'src/worker-groups/schemas/worker-groups.schema';
import {
  RecurrenceType,
  WorkerEligibilityMode,
} from '../service-type.constants';

export type ServiceTypeDocument = ServiceType & Document;

@Schema({ _id: false })
export class ServiceRecurrence {
  @Prop({
    type: String,
    enum: Object.values(RecurrenceType),
    required: true,
  })
  type!: RecurrenceType;

  @Prop({ min: 0, max: 6 })
  weekday?: number;
}

@Schema({ _id: false })
export class WorkerEligibility {
  @Prop({
    type: String,
    enum: Object.values(WorkerEligibilityMode),
    required: true,
  })
  mode!: WorkerEligibilityMode;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: WorkerGroup.name,
    default: [],
  })
  allowed_group_ids!: Types.ObjectId[];

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: WorkerGroup.name,
    default: [],
  })
  preferred_group_ids!: Types.ObjectId[];
}

@Schema({ _id: false })
export class AssignmentSlot {
  @Prop({ required: true, trim: true, lowercase: true })
  key!: string;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({
    type: [String],
    enum: Object.values(WorkerRole),
    required: true,
  })
  allowed_roles!: WorkerRole[];

  @Prop({ default: false })
  required!: boolean;

  @Prop({ default: 0 })
  display_order!: number;

  @Prop({ type: WorkerEligibility })
  worker_eligibility_override?: WorkerEligibility;
}

@Schema({ timestamps: true })
export class ServiceType {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: ServiceRecurrence, required: true })
  recurrence!: ServiceRecurrence;

  @Prop({ type: WorkerEligibility, required: true })
  worker_eligibility!: WorkerEligibility;

  @Prop({ type: [AssignmentSlot], default: [] })
  assignment_slots!: AssignmentSlot[];

  @Prop({ default: false })
  auto_generation_enabled!: boolean;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ default: 0 })
  display_order!: number;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);

ServiceTypeSchema.index({ display_order: 1, name: 1 });
