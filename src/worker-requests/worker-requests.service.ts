import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { SwapMode } from 'src/common/enums/swap-mode.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { PushNotificationsService } from 'src/push-notifications/push-notifications.service';
import {
  PreparedScheduleSwap,
  ScheduleAssignmentSnapshot,
  SchedulesService,
} from 'src/schedules/schedules.service';
import { WorkerUnavailabilityService } from 'src/worker-unavailability/worker-unavailability.service';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';
import { CreateUnavailableRequestDto } from './dto/create-unavailable-request.dto';
import { SwapOptionsQueryDto } from './dto/swap-options-query.dto';
import { WorkerRequestsRepository } from './repositories/worker-requests.repository';

@Injectable()
export class WorkerRequestsService {
  private readonly logger = new Logger(WorkerRequestsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly repository: WorkerRequestsRepository,
    private readonly schedulesService: SchedulesService,
    private readonly unavailabilityService: WorkerUnavailabilityService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async createSwap(userId: string, dto: CreateSwapRequestDto) {
    const worker = await this.unavailabilityService.requireLinkedWorker(userId);
    const prepared = await this.schedulesService.prepareSwap(
      worker._id.toString(),
      dto.mode,
      dto.source_schedule_id,
      dto.source_slot_key,
      dto.target_worker_id,
      dto.target_schedule_id,
      dto.target_slot_key,
    );

    const created = await this.repository.create({
      type: WorkerRequestType.Swap,
      swap_mode: dto.mode,
      status: WorkerRequestStatus.Pending,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_id: worker._id,
      requester_worker_name: worker.name,
      source_assignment: this.toStoredSnapshot(prepared.source_snapshot),
      target_assignment: prepared.target_snapshot
        ? this.toStoredSnapshot(prepared.target_snapshot)
        : undefined,
      target_worker_id: prepared.replacement_worker
        ? new Types.ObjectId(prepared.replacement_worker._id)
        : undefined,
      target_worker_name: prepared.replacement_worker?.name,
      reason: dto.reason?.trim(),
    });

    await this.notifySafely(
      () => this.pushNotificationsService.notifyRequestCreated(created as any),
      `new swap request ${created._id?.toString() ?? ''}`,
    );
    return created;
  }

  async createUnavailable(userId: string, dto: CreateUnavailableRequestDto) {
    const worker = await this.unavailabilityService.requireLinkedWorker(userId);
    const date = this.normalizeDate(dto.date);

    if (date < this.getCurrentLocalDate()) {
      throw new BadRequestException('Unavailable dates cannot be in the past');
    }

    await this.unavailabilityService.assertWorkersAvailable(
      [worker._id.toString()],
      date,
    );
    const existing = await this.repository.findPendingUnavailable(
      worker._id.toString(),
      date,
    );
    if (existing) {
      throw new ConflictException('An unavailable request already exists for this date');
    }

    const created = await this.repository.create({
      type: WorkerRequestType.Unavailable,
      status: WorkerRequestStatus.Pending,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_id: worker._id,
      requester_worker_name: worker.name,
      unavailable_date: date,
      reason: dto.reason?.trim(),
    });

    await this.notifySafely(
      () => this.pushNotificationsService.notifyRequestCreated(created as any),
      `new unavailable request ${created._id?.toString() ?? ''}`,
    );
    return created;
  }

  async getSwapOptions(userId: string, query: SwapOptionsQueryDto) {
    const worker = await this.unavailabilityService.requireLinkedWorker(userId);
    return await this.schedulesService.getSwapOptions(
      worker._id.toString(),
      query.mode,
      query.source_schedule_id,
      query.source_slot_key,
    );
  }

  async getMine(userId: string, query: Record<string, string | undefined>) {
    const worker = await this.unavailabilityService.requireLinkedWorker(userId);
    const filter = this.buildFilters(query);
    filter.$or = [
      { requester_user_id: new Types.ObjectId(userId) },
      { target_worker_id: worker._id },
      { 'target_assignment.worker_id': worker._id },
    ];
    return await this.repository.list(
      filter,
      positiveInteger(query.page, 1),
      Math.min(positiveInteger(query.limit, 20), 100),
    );
  }

  async getAll(query: Record<string, string | undefined>) {
    return await this.repository.list(
      this.buildFilters(query),
      positiveInteger(query.page, 1),
      Math.min(positiveInteger(query.limit, 20), 100),
    );
  }

  async cancel(id: string, userId: string) {
    const request = await this.getRequest(id);
    if (request.requester_user_id.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own request');
    }
    if (request.status === WorkerRequestStatus.Cancelled) return request;
    if (request.status !== WorkerRequestStatus.Pending) {
      throw new ConflictException('Only pending requests can be cancelled');
    }

    const cancelled = await this.repository.updatePending(id, {
      status: WorkerRequestStatus.Cancelled,
    });
    if (!cancelled) throw new ConflictException('Request status changed');
    return cancelled;
  }

  async reject(id: string, reviewerId: string, note?: string) {
    const request = await this.getRequest(id);
    if (request.status === WorkerRequestStatus.Rejected) return request;
    if (request.status !== WorkerRequestStatus.Pending) {
      throw new ConflictException('Only pending requests can be rejected');
    }

    const rejected = await this.repository.updatePending(id, {
      status: WorkerRequestStatus.Rejected,
      reviewed_by: new Types.ObjectId(reviewerId),
      reviewed_at: new Date(),
      reviewer_note: note?.trim(),
    });
    if (!rejected) throw new ConflictException('Request status changed');
    await this.notifySafely(
      () =>
        this.pushNotificationsService.notifyRequestReviewed(rejected as any),
      `rejected request ${id}`,
    );
    return rejected;
  }

  async approve(id: string, reviewerId: string, note?: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Request not found');
    const session = await this.connection.startSession();
    let result: any;
    let shouldNotify = false;

    try {
      await session.withTransaction(async () => {
        const request = await this.repository.findById(id, session);
        if (!request) throw new NotFoundException('Request not found');
        if (request.status === WorkerRequestStatus.Approved) {
          result = request;
          return;
        }
        if (request.status !== WorkerRequestStatus.Pending) {
          throw new ConflictException('Only pending requests can be approved');
        }

        if (request.type === WorkerRequestType.Unavailable) {
          const date = request.unavailable_date!;
          const blocking = await this.schedulesService.getWorkerAssignmentsOnDate(
            request.requester_worker_id.toString(),
            date,
            session,
          );
          if (blocking.length) {
            throw new ConflictException({
              message: 'Resolve this worker\'s assignments before approving the unavailable date',
              errors: {
                blocking_schedules: blocking.map((schedule: any) => ({
                  _id: schedule._id,
                  date: schedule.date,
                  service_type: schedule.service_type,
                })),
              },
            });
          }

          await this.unavailabilityService.activate(
            request.requester_worker_id.toString(),
            date,
            id,
            reviewerId,
            request.reason,
            session,
          );
        } else {
          const prepared = await this.prepareStoredSwap(
            request,
            reviewerId,
            note,
            session,
          );
          if (!prepared) {
            result = await this.repository.findById(id, session);
            return;
          }
          await this.schedulesService.executePreparedSwap(prepared, session);
        }

        result = await this.repository.updatePending(
          id,
          {
            status: WorkerRequestStatus.Approved,
            reviewed_by: new Types.ObjectId(reviewerId),
            reviewed_at: new Date(),
            reviewer_note: note?.trim(),
            executed_at: new Date(),
          },
          session,
        );
        if (!result) throw new ConflictException('Request status changed');
        shouldNotify = true;
      });
    } finally {
      await session.endSession();
    }

    if (shouldNotify) {
      await this.notifySafely(
        () => this.pushNotificationsService.notifyRequestReviewed(result),
        `approved request ${id}`,
      );
    }
    return result;
  }

  private async prepareStoredSwap(
    request: any,
    reviewerId: string,
    reviewerNote: string | undefined,
    session: any,
  ) {
    try {
      const prepared = await this.schedulesService.prepareSwap(
        request.requester_worker_id.toString(),
        request.swap_mode as SwapMode,
        request.source_assignment.schedule_id.toString(),
        request.source_assignment.slot_key,
        request.target_worker_id?.toString(),
        request.target_assignment?.schedule_id.toString(),
        request.target_assignment?.slot_key,
        session,
      );

      if (
        !this.snapshotsMatch(prepared.source_snapshot, request.source_assignment) ||
        (request.target_assignment &&
          (!prepared.target_snapshot ||
            !this.snapshotsMatch(prepared.target_snapshot, request.target_assignment)))
      ) {
        throw new BadRequestException('A selected schedule assignment has changed');
      }

      return prepared;
    } catch (error) {
      if (!(error instanceof HttpException) || error instanceof ConflictException) {
        throw error;
      }

      const failureReason = this.getErrorMessage(error);
      const failed = await this.repository.updatePending(
        request._id.toString(),
        {
          status: WorkerRequestStatus.Failed,
          failure_reason: failureReason,
          reviewed_by: new Types.ObjectId(reviewerId),
          reviewed_at: new Date(),
          reviewer_note: reviewerNote?.trim(),
        },
        session,
      );
      if (!failed) throw new ConflictException('Request status changed');
      return undefined;
    }
  }

  private snapshotsMatch(current: ScheduleAssignmentSnapshot, stored: any) {
    return (
      current.schedule_id === stored.schedule_id.toString() &&
      current.schedule_date.toISOString() === new Date(stored.schedule_date).toISOString() &&
      current.service_type === stored.service_type &&
      current.slot_key === stored.slot_key &&
      current.role === stored.role &&
      current.worker_id === stored.worker_id.toString()
    );
  }

  private toStoredSnapshot(snapshot: ScheduleAssignmentSnapshot) {
    return {
      ...snapshot,
      schedule_id: new Types.ObjectId(snapshot.schedule_id),
      worker_id: new Types.ObjectId(snapshot.worker_id),
    };
  }

  private buildFilters(query: Record<string, string | undefined>) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      if (!Object.values(WorkerRequestStatus).includes(query.status as WorkerRequestStatus)) {
        throw new BadRequestException('Invalid request status');
      }
      filter.status = query.status;
    }
    if (query.type) {
      if (!Object.values(WorkerRequestType).includes(query.type as WorkerRequestType)) {
        throw new BadRequestException('Invalid request type');
      }
      filter.type = query.type;
    }
    return filter;
  }

  private async getRequest(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Request not found');
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  private getErrorMessage(error: HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as any).message;
    return Array.isArray(message) ? message.join(', ') : String(message ?? error.message);
  }

  private normalizeDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private getCurrentLocalDate() {
    const offsetMinutes = Number(process.env.CHURCH_TIMEZONE_OFFSET_MINUTES || 480);
    const localNow = new Date(Date.now() + offsetMinutes * 60 * 1000);
    return new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    ));
  }

  private async notifySafely(
    action: () => Promise<unknown>,
    description: string,
  ) {
    try {
      await action();
    } catch (error) {
      this.logger.error(
        `Could not send notification for ${description}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

const positiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
