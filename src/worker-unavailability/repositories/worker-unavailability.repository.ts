import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  WorkerUnavailability,
  WorkerUnavailabilityDocument,
} from '../schemas/worker-unavailability.schema';

export class WorkerUnavailabilityRepository {
  constructor(
    @InjectModel(WorkerUnavailability.name)
    private readonly model: Model<WorkerUnavailabilityDocument>,
  ) {}

  async activate(
    workerId: string,
    date: Date,
    requestId: string,
    createdBy: string,
    reason: string | undefined,
    session: ClientSession,
  ) {
    return await this.model.findOneAndUpdate(
      { worker_id: new Types.ObjectId(workerId), date },
      {
        $set: {
          source_request_id: new Types.ObjectId(requestId),
          created_by: new Types.ObjectId(createdBy),
          reason,
          is_active: true,
        },
        $unset: {
          revoked_by: 1,
          revoked_at: 1,
          revocation_note: 1,
        },
      },
      { new: true, upsert: true, session },
    ).lean().exec();
  }

  async findActive(workerIds: string[], date: Date, session?: ClientSession) {
    const query = this.model.find({
      worker_id: { $in: workerIds.map((id) => new Types.ObjectId(id)) },
      date,
      is_active: true,
    }).lean();

    if (session) query.session(session);
    return await query.exec();
  }

  async findActiveInRange(startDate: Date, endDate: Date) {
    return await this.model.find({
      date: { $gte: startDate, $lt: endDate },
      is_active: true,
    }).lean().exec();
  }

  async list(filter: Record<string, unknown>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ date: 1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      items,
      pagination: {
        page: total ? page : 0,
        per_page: limit,
        last_page: total ? Math.ceil(total / limit) : 0,
        total_rows: total,
      },
    };
  }

  async deactivate(id: string, reviewerId: string, note?: string) {
    return await this.model.findOneAndUpdate(
      { _id: id, is_active: true },
      {
        $set: {
          is_active: false,
          revoked_by: new Types.ObjectId(reviewerId),
          revoked_at: new Date(),
          revocation_note: note,
        },
      },
      { new: true },
    ).lean().exec();
  }
}
