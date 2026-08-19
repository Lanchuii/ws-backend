import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  async findByIds(ids: string[]) {
    return await this.workerModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .lean()
      .exec();
  }

  async findWithLegacyLeaderSongs() {
    return await this.workerModel
      .find({ 'leader_songs.0': { $exists: true } })
      .lean()
      .exec();
  }

  async clearLegacyLeaderSongs(workerId: string) {
    return await this.workerModel
      .updateOne(
        { _id: workerId },
        { $unset: { leader_songs: 1 } },
      )
      .exec();
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
