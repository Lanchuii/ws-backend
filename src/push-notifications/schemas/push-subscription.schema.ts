import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from 'src/users/schemas/users.schema';

export type PushSubscriptionDocument = PushSubscriptionRecord & Document;

@Schema({ timestamps: true })
export class PushSubscriptionRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  user_id!: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  endpoint!: string;

  @Prop()
  expiration_time?: Date;

  @Prop({ required: true })
  p256dh!: string;

  @Prop({ required: true })
  auth!: string;

  @Prop()
  last_weekly_reminder_week?: Date;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(
  PushSubscriptionRecord,
);

PushSubscriptionSchema.index({ user_id: 1 });
PushSubscriptionSchema.index({ user_id: 1, last_weekly_reminder_week: 1 });
