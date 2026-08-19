import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { CreatePushSubscriptionDto } from '../dto/push-subscription.dto';
import {
  PushSubscriptionDocument,
  PushSubscriptionRecord,
} from '../schemas/push-subscription.schema';

export class PushSubscriptionsRepository {
  constructor(
    @InjectModel(PushSubscriptionRecord.name)
    private readonly model: Model<PushSubscriptionDocument>,
  ) {}

  async upsertForUser(userId: string, dto: CreatePushSubscriptionDto) {
    const existing = await this.model
      .findOne({ endpoint: dto.endpoint })
      .lean()
      .exec();
    const ownerChanged = existing && existing.user_id.toString() !== userId;
    const setValues: Record<string, unknown> = {
      user_id: new Types.ObjectId(userId),
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    };
    const unsetValues: Record<string, 1> = {};

    if (dto.expirationTime) {
      setValues.expiration_time = new Date(dto.expirationTime);
    } else {
      unsetValues.expiration_time = 1;
    }

    if (ownerChanged) {
      unsetValues.last_weekly_reminder_week = 1;
    }

    const update: UpdateQuery<PushSubscriptionDocument> = {
      $set: setValues,
      ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}),
    };

    return await this.model
      .findOneAndUpdate({ endpoint: dto.endpoint }, update, {
        new: true,
        upsert: true,
      })
      .lean()
      .exec();
  }

  async findPendingForUsers(userIds: string[], weekStart: Date) {
    return await this.model
      .find({
        user_id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        last_weekly_reminder_week: { $ne: weekStart },
      })
      .lean()
      .exec();
  }

  async findForUsers(userIds: string[]) {
    if (!userIds.length) return [];

    return await this.model
      .find({
        user_id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean()
      .exec();
  }

  async markWeeklyReminderSent(id: string, weekStart: Date) {
    return await this.model
      .updateOne(
        { _id: id },
        { $set: { last_weekly_reminder_week: weekStart } },
      )
      .exec();
  }

  async deleteForUser(userId: string, endpoint: string) {
    return await this.model
      .deleteOne({ user_id: new Types.ObjectId(userId), endpoint })
      .exec();
  }

  async deleteById(id: string) {
    return await this.model.deleteOne({ _id: id }).exec();
  }
}
