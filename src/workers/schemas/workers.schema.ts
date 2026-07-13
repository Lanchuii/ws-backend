import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';

export type WorkerDocument = Worker & Document;

@Schema({ _id: false })
export class LeaderSong {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  key!: string;
}

@Schema({ timestamps: true })
export class Worker {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ enum: Object.values(WorkerRole), type: [String], default: [] })
  roles!: WorkerRole[];

  @Prop({ type: String, enum: Object.values(WorkerLabel), default: WorkerLabel.Main })
  label!: WorkerLabel;

  @Prop({ type: String, enum: Object.values(WorkerStatus), default: WorkerStatus.Active })
  status!: WorkerStatus;

  @Prop({ type: [LeaderSong], default: [] })
  leader_songs!: LeaderSong[];
}

export const WorkerSchema = SchemaFactory.createForClass(Worker);
