import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { WorkersService } from 'src/workers/workers.service';
import { WorkerUnavailabilityRepository } from './repositories/worker-unavailability.repository';

@Injectable()
export class WorkerUnavailabilityService {
  constructor(
    private readonly repository: WorkerUnavailabilityRepository,
    private readonly workersService: WorkersService,
  ) {}

  async assertWorkersAvailable(
    workerIds: string[],
    date: Date,
    session?: ClientSession,
  ) {
    if (!workerIds.length) return;
    const records = await this.repository.findActive(workerIds, date, session);

    if (records.length) {
      throw new BadRequestException(
        'An assigned worker is unavailable on this date',
      );
    }
  }

  async getUnavailableWorkerIds(startDate: Date, endDate: Date) {
    const records = await this.repository.findActiveInRange(startDate, endDate);
    return records.reduce<Map<string, Set<string>>>((dates, record) => {
      const dateKey = record.date.toISOString().slice(0, 10);
      const workerIds = dates.get(dateKey) ?? new Set<string>();
      workerIds.add(record.worker_id.toString());
      dates.set(dateKey, workerIds);
      return dates;
    }, new Map());
  }

  async activate(
    workerId: string,
    date: Date,
    requestId: string,
    createdBy: string,
    reason: string | undefined,
    session: ClientSession,
  ) {
    return await this.repository.activate(
      workerId,
      date,
      requestId,
      createdBy,
      reason,
      session,
    );
  }

  async getMine(userId: string, pageValue = '1', limitValue = '20') {
    const worker = await this.workersService.findWorkerByUserId(userId);
    if (!worker) return { worker: null, items: [], pagination: emptyPagination() };

    const result = await this.repository.list(
      { worker_id: worker._id, is_active: true },
      positiveInteger(pageValue, 1),
      Math.min(positiveInteger(limitValue, 20), 100),
    );
    return { worker: { _id: worker._id, name: worker.name }, ...result };
  }

  async getAll(query: Record<string, string | undefined>) {
    const filter: Record<string, unknown> = {};
    if (query.active !== undefined) filter.is_active = query.active !== 'false';
    if (query.worker_id) {
      if (!Types.ObjectId.isValid(query.worker_id)) {
        throw new BadRequestException('Invalid worker id');
      }
      filter.worker_id = new Types.ObjectId(query.worker_id);
    }

    return await this.repository.list(
      filter,
      positiveInteger(query.page, 1),
      Math.min(positiveInteger(query.limit, 20), 100),
    );
  }

  async remove(id: string, reviewerId: string, note?: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Unavailable date not found');
    const record = await this.repository.deactivate(id, reviewerId, note?.trim());
    if (!record) throw new NotFoundException('Unavailable date not found');
    return record;
  }

  async requireLinkedWorker(userId: string) {
    const worker = await this.workersService.findWorkerByUserId(userId);
    if (!worker) throw new ForbiddenException('Your account is not linked to a worker');
    return worker;
  }
}

const positiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const emptyPagination = () => ({ page: 0, per_page: 20, last_page: 0, total_rows: 0 });
