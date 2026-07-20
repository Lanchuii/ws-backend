import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { Schedule, ScheduleDocument } from '../schemas/schedules.schema';

export class SchedulesRepository extends BaseRepository<ScheduleDocument> {
  constructor(
    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<ScheduleDocument>,
  ) {
    super(scheduleModel);
  }

  async findWorkerConflictOnDate(date: Date, workerIds: Types.ObjectId[], excludeId?: string) {
    const query: any = {
      date,
      'assignments.worker_id': { $in: workerIds },
    };

    if (excludeId) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }

    return await this.scheduleModel.findOne(query).lean().exec();
  }

  async findSchedulesInDateRange(startDate: Date, endDate: Date, serviceType?: string) {
    const query: any = {
      date: {
        $gte: startDate,
        $lt: endDate,
      },
    };

    if (serviceType) {
      query.service_type = serviceType;
    }

    return await this.scheduleModel.find(query).sort({ date: 'asc' }).lean().exec();
  }

  async findScheduleOnDate(date: Date, serviceType: string, excludeId?: string) {
    const query: any = { date, service_type: serviceType };

    if (excludeId) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }

    return await this.scheduleModel
      .findOne(query)
      .lean()
      .exec();
  }

  async findWorkerAssignments(workerId: string, fromDate: Date) {
    return await this.scheduleModel
      .find({
        date: { $gte: fromDate },
        'assignments.worker_id': new Types.ObjectId(workerId),
      })
      .sort({ date: 'asc', service_type: 'asc' })
      .lean()
      .exec();
  }

  async markSchedulesInactiveThroughDate(date: Date) {
    return await this.scheduleModel
      .updateMany(
        {
          status: ScheduleStatus.Active,
          date: { $lte: date },
        },
        { status: ScheduleStatus.Inactive },
      )
      .exec();
  }
}
