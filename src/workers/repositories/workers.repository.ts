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
}
