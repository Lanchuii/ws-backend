import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { NotificationType } from 'src/common/enums/notification-type.enum';
import { User } from 'src/users/schemas/users.schema';

export type NotificationInboxDocument = NotificationInboxRecord & Document;

@Schema({ timestamps: true, collection: 'notification_inbox' })
export class NotificationInboxRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  user_id!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(NotificationType), required: true })
  type!: NotificationType;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  body!: string;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({ required: true, trim: true })
  dedupe_key!: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  @Prop()
  read_at?: Date;
}

export const NotificationInboxSchema = SchemaFactory.createForClass(
  NotificationInboxRecord,
);

NotificationInboxSchema.index({ user_id: 1, dedupe_key: 1 }, { unique: true });
NotificationInboxSchema.index({ user_id: 1, read_at: 1, createdAt: -1 });
