import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SongDocument = Song & Document;

@Schema({ timestamps: true })
export class Song {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  artist!: string;

  @Prop({ required: true, trim: true })
  normalized_title!: string;

  @Prop({ trim: true, default: '' })
  normalized_artist!: string;

  @Prop({ trim: true })
  spotify_url?: string;

  @Prop({ default: true })
  is_active!: boolean;
}

export const SongSchema = SchemaFactory.createForClass(Song);

SongSchema.index(
  { normalized_title: 1, normalized_artist: 1 },
  { unique: true },
);
SongSchema.index({ normalized_title: 1 });
SongSchema.index({ normalized_artist: 1 });
