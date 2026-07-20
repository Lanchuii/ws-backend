import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import { Worker, WorkerDocument } from '../schemas/workers.schema';

export class WorkersRepository extends BaseRepository<WorkerDocument> {
  constructor(
    @InjectModel(Worker.name)
    private readonly workerModel: Model<WorkerDocument>,
  ) {
    super(workerModel);
  }

  async findByUserId(userId: string) {
    return await this.workerModel.findOne({ user_id: userId }).lean().exec();
  }

  async backfillLegacyWorkerGroups(mainGroupId: string, youthGroupId: string) {
    const missingGroups = {
      $or: [
        { worker_group_ids: { $exists: false } },
        { worker_group_ids: { $size: 0 } },
      ],
    };

    await Promise.all([
      this.workerModel.updateMany(
        { ...missingGroups, label: 'youth' },
        { $set: { worker_group_ids: [youthGroupId] } },
      ),
      this.workerModel.updateMany(
        {
          $and: [
            missingGroups,
            {
              $or: [
                { label: 'main' },
                { label: { $exists: false } },
              ],
            },
          ],
        },
        { $set: { worker_group_ids: [mainGroupId] } },
      ),
    ]);
  }
}
