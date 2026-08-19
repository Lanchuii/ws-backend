import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
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

  async findWorkerConflictOnDate(
    date: Date,
    workerIds: Types.ObjectId[],
    excludeIds?: string | string[],
    session?: ClientSession,
  ) {
    const query: any = {
      date,
      'assignments.worker_id': { $in: workerIds },
    };

    if (excludeIds) {
      const ids = (Array.isArray(excludeIds) ? excludeIds : [excludeIds])
        .map((id) => new Types.ObjectId(id));
      query._id = { $nin: ids };
    }

    const result = this.scheduleModel.findOne(query).lean();
    if (session) result.session(session);
    return await result.exec();
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

  async findActiveSchedulesInDateRange(startDate: Date, endDate: Date) {
    return await this.scheduleModel
      .find({
        date: { $gte: startDate, $lt: endDate },
        status: ScheduleStatus.Active,
      })
      .sort({ date: 'asc', service_type: 'asc' })
      .lean()
      .exec();
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

  async findWorkerAssignmentsOnDate(
    workerId: string,
    date: Date,
    session?: ClientSession,
  ) {
    const result = this.scheduleModel.find({
      date,
      'assignments.worker_id': new Types.ObjectId(workerId),
    }).sort({ service_type: 'asc' }).lean();
    if (session) result.session(session);
    return await result.exec();
  }

  async findActiveSchedulesFromDate(date: Date) {
    return await this.scheduleModel.find({
      date: { $gte: date },
      status: ScheduleStatus.Active,
    }).sort({ date: 'asc', service_type: 'asc' }).lean().exec();
  }

  async getById(id: string, session?: ClientSession) {
    const result = this.scheduleModel.findById(id).lean();
    if (session) result.session(session);
    return await result.exec();
  }

  async updateAssignments(
    id: string,
    assignments: unknown[],
    session: ClientSession,
  ) {
    return await this.scheduleModel.findByIdAndUpdate(
      id,
      { $set: { assignments } },
      { new: true, session },
    ).lean().exec();
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
