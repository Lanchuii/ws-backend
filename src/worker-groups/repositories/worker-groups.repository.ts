import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import {
  WorkerGroup,
  WorkerGroupDocument,
} from '../schemas/worker-groups.schema';

export class WorkerGroupsRepository extends BaseRepository<WorkerGroupDocument> {
  constructor(
    @InjectModel(WorkerGroup.name)
    private readonly workerGroupModel: Model<WorkerGroupDocument>,
  ) {
    super(workerGroupModel);
  }

  async findAll() {
    return await this.workerGroupModel
      .find()
      .sort({ display_order: 1, name: 1 })
      .lean()
      .exec();
  }

  async findByCodes(codes: string[]) {
    return await this.workerGroupModel
      .find({ code: { $in: codes } })
      .lean()
      .exec();
  }

  async findByIds(ids: string[]) {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    return await this.workerGroupModel
      .find({ _id: { $in: objectIds } })
      .lean()
      .exec();
  }

  async createIfMissing(data: {
    code: string;
    name: string;
    display_order: number;
  }) {
    return await this.workerGroupModel
      .findOneAndUpdate(
        { code: data.code },
        { $setOnInsert: { ...data, is_active: true } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }
}
