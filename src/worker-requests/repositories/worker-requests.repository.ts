import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { WorkerRequest, WorkerRequestDocument } from '../schemas/worker-request.schema';

export class WorkerRequestsRepository {
  constructor(
    @InjectModel(WorkerRequest.name)
    private readonly model: Model<WorkerRequestDocument>,
  ) {}

  async create(data: Record<string, unknown>) {
    return (await new this.model(data).save()).toObject();
  }

  async findById(id: string, session?: ClientSession) {
    const query = this.model.findById(id).lean();
    if (session) query.session(session);
    return await query.exec();
  }

  async findPendingUnavailable(workerId: string, date: Date) {
    return await this.model.findOne({
      requester_worker_id: new Types.ObjectId(workerId),
      type: WorkerRequestType.Unavailable,
      unavailable_date: date,
      status: WorkerRequestStatus.Pending,
    }).lean().exec();
  }

  async list(filter: Record<string, unknown>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
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

  async updatePending(
    id: string,
    update: Record<string, unknown>,
    session?: ClientSession,
  ) {
    return await this.model.findOneAndUpdate(
      { _id: id, status: WorkerRequestStatus.Pending },
      { $set: update },
      { new: true, session },
    ).lean().exec();
  }

  async findLegacyPendingSwaps() {
    return await this.model.find({
      type: WorkerRequestType.Swap,
      status: WorkerRequestStatus.Pending,
      $or: [
        { target_user_id: { $exists: false } },
        { target_response: { $exists: false } },
      ],
    }).lean().exec();
  }

  async updatePendingForTarget(
    id: string,
    targetUserId: string,
    update: Record<string, unknown>,
  ) {
    return await this.model.findOneAndUpdate(
      {
        _id: id,
        status: WorkerRequestStatus.Pending,
        target_user_id: new Types.ObjectId(targetUserId),
      },
      { $set: update },
      { new: true },
    ).lean().exec();
  }
}
