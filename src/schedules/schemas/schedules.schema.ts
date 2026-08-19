import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { Song } from 'src/songs/schemas/songs.schema';
import { Worker } from 'src/workers/schemas/workers.schema';

export type ScheduleDocument = Schedule & Document;

@Schema({ _id: false })
export class ScheduleAssignment {
  @Prop({ trim: true })
  slot_key?: string;

  @Prop({ type: String, enum: Object.values(WorkerRole), required: true })
  role!: WorkerRole;

  @Prop({ type: Types.ObjectId, ref: Worker.name, required: true })
  worker_id!: Types.ObjectId;

  @Prop({ required: true })
  worker_name!: string;
}

@Schema({ _id: false })
export class ScheduleSong {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Song.name })
  song_id?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  artist?: string;

  @Prop({ trim: true })
  key?: string;
}

@Schema({ timestamps: true })
export class Schedule {
  @Prop({ required: true })
  date!: Date;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  service_type!: string;

  @Prop({ type: String, enum: Object.values(ScheduleStatus), default: ScheduleStatus.Active })
  status!: ScheduleStatus;

  @Prop({ type: [ScheduleAssignment], default: [] })
  assignments!: ScheduleAssignment[];

  @Prop({ type: [ScheduleSong], default: [] })
  songs!: ScheduleSong[];

  @Prop({ trim: true })
  lineup?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);

ScheduleSchema.index({ date: 1 });
ScheduleSchema.index({ date: 1, 'assignments.worker_id': 1 });
