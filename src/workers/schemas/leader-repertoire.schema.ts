import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Song } from 'src/songs/schemas/songs.schema';
import { Worker } from './workers.schema';

export type LeaderRepertoireDocument = LeaderRepertoire & Document;

@Schema({ timestamps: true })
export class LeaderRepertoire {
  @Prop({ type: Types.ObjectId, ref: Worker.name, required: true })
  worker_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Song.name, required: true })
  song_id!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  key!: string;
}

export const LeaderRepertoireSchema =
  SchemaFactory.createForClass(LeaderRepertoire);

LeaderRepertoireSchema.index(
  { worker_id: 1, song_id: 1 },
  { unique: true },
);
LeaderRepertoireSchema.index({ worker_id: 1, createdAt: -1 });
LeaderRepertoireSchema.index({ song_id: 1 });
