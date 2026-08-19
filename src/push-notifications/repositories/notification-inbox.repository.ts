import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationType } from 'src/common/enums/notification-type.enum';
import {
  NotificationInboxDocument,
  NotificationInboxRecord,
} from '../schemas/notification-inbox.schema';

export interface CreateInboxNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export class NotificationInboxRepository {
  constructor(
    @InjectModel(NotificationInboxRecord.name)
    private readonly model: Model<NotificationInboxDocument>,
  ) {}

  async upsertMany(entries: CreateInboxNotification[]) {
    if (!entries.length) return { upsertedCount: 0 };

    return await this.model.bulkWrite(
      entries.map((entry) => {
        const userId = new Types.ObjectId(entry.userId);
        return {
          updateOne: {
            filter: { user_id: userId, dedupe_key: entry.dedupeKey },
            update: {
              $setOnInsert: {
                user_id: userId,
                type: entry.type,
                title: entry.title,
                body: entry.body,
                url: entry.url,
                dedupe_key: entry.dedupeKey,
                metadata: entry.metadata,
              },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  }

  async listForUser(userId: string, page: number, limit: number) {
    const filter = { user_id: new Types.ObjectId(userId) };
    const [items, total, unreadCount] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
      this.model.countDocuments({ ...filter, read_at: null }).exec(),
    ]);

    return {
      items,
      unread_count: unreadCount,
      pagination: {
        page: total ? page : 0,
        per_page: limit,
        last_page: total ? Math.ceil(total / limit) : 0,
        total_rows: total,
      },
    };
  }

  async markRead(userId: string, id: string) {
    return await this.model
      .findOneAndUpdate(
        { _id: id, user_id: new Types.ObjectId(userId) },
        { $set: { read_at: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async markAllRead(userId: string) {
    const result = await this.model
      .updateMany(
        { user_id: new Types.ObjectId(userId), read_at: null },
        { $set: { read_at: new Date() } },
      )
      .exec();
    return { updated: result.modifiedCount };
  }
}
