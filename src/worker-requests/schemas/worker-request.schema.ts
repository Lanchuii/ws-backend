import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { SwapMode } from 'src/common/enums/swap-mode.enum';
import { SwapTargetResponse } from 'src/common/enums/swap-target-response.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { User } from 'src/users/schemas/users.schema';
import { Worker } from 'src/workers/schemas/workers.schema';

export type WorkerRequestDocument = WorkerRequest & Document;

@Schema({ _id: false })
export class RequestAssignmentSnapshot {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Schedule', required: true })
  schedule_id!: Types.ObjectId;

  @Prop({ required: true })
  schedule_date!: Date;

  @Prop({ required: true, trim: true })
  service_type!: string;

  @Prop({ required: true, trim: true })
  slot_key!: string;

  @Prop({ type: String, enum: Object.values(WorkerRole), required: true })
  role!: WorkerRole;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Worker.name, required: true })
  worker_id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  worker_name!: string;
}

const RequestAssignmentSnapshotSchema =
  SchemaFactory.createForClass(RequestAssignmentSnapshot);

@Schema({ timestamps: true, collection: 'worker_requests' })
export class WorkerRequest {
  @Prop({ type: String, enum: Object.values(WorkerRequestType), required: true })
  type!: WorkerRequestType;

  @Prop({ type: String, enum: Object.values(SwapMode) })
  swap_mode?: SwapMode;

  @Prop({
    type: String,
    enum: Object.values(WorkerRequestStatus),
    default: WorkerRequestStatus.Pending,
  })
  status!: WorkerRequestStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  requester_user_id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Worker.name, required: true })
  requester_worker_id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  requester_worker_name!: string;

  @Prop({ type: RequestAssignmentSnapshotSchema })
  source_assignment?: RequestAssignmentSnapshot;

  @Prop({ type: RequestAssignmentSnapshotSchema })
  target_assignment?: RequestAssignmentSnapshot;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Worker.name })
  target_worker_id?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name })
  target_user_id?: Types.ObjectId;

  @Prop({ trim: true })
  target_worker_name?: string;

  @Prop({ type: String, enum: Object.values(SwapTargetResponse) })
  target_response?: SwapTargetResponse;

  @Prop()
  target_responded_at?: Date;

  @Prop({ trim: true })
  target_response_note?: string;

  @Prop()
  unavailable_date?: Date;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name })
  reviewed_by?: Types.ObjectId;

  @Prop()
  reviewed_at?: Date;

  @Prop({ trim: true })
  reviewer_note?: string;

  @Prop()
  executed_at?: Date;

  @Prop({ trim: true })
  failure_reason?: string;
}

export const WorkerRequestSchema = SchemaFactory.createForClass(WorkerRequest);

WorkerRequestSchema.index({ status: 1, createdAt: -1 });
WorkerRequestSchema.index({ requester_user_id: 1, createdAt: -1 });
WorkerRequestSchema.index({ requester_worker_id: 1, status: 1 });
WorkerRequestSchema.index({ target_user_id: 1, status: 1, createdAt: -1 });
