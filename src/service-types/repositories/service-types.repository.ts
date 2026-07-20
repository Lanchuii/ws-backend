import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import {
  ServiceType,
  ServiceTypeDocument,
} from '../schemas/service-types.schema';

export class ServiceTypesRepository extends BaseRepository<ServiceTypeDocument> {
  constructor(
    @InjectModel(ServiceType.name)
    private readonly serviceTypeModel: Model<ServiceTypeDocument>,
  ) {
    super(serviceTypeModel);
  }

  async findAll() {
    return await this.serviceTypeModel
      .find()
      .sort({ display_order: 1, name: 1 })
      .lean()
      .exec();
  }

  async findByCode(code: string) {
    return await this.serviceTypeModel.findOne({ code }).lean().exec();
  }

  async createIfMissing(data: Record<string, unknown>) {
    return await this.serviceTypeModel
      .findOneAndUpdate(
        { code: data.code },
        { $setOnInsert: data },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }
}
