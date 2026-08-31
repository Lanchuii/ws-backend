import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientSession, Types } from 'mongoose';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { WorkersService } from 'src/workers/workers.service';
import { AutoGenerationConfirmDto } from './dto/auto-generation-confirm.dto';
import { AutoGenerationPreviewDto } from './dto/auto-generation-preview.dto';
import { CreateScheduleDTO } from './dto/create-schedule.dto';
import { ScheduleAssignmentDto } from './dto/schedule-assignment.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ScheduleAutoGenerationService } from './schedule-auto-generation.service';
import { SchedulesRepository } from './repositories/schedules.repository';
import { ServiceTypesService } from 'src/service-types/service-types.service';
import { WorkerEligibilityMode } from 'src/service-types/service-type.constants';
import { WorkerUnavailabilityService } from 'src/worker-unavailability/worker-unavailability.service';
import { SwapMode } from 'src/common/enums/swap-mode.enum';
import { PushNotificationsService } from 'src/push-notifications/push-notifications.service';
import { UpdateScheduleLineupDto } from './dto/update-schedule-lineup.dto';
import {
  getScheduleConflicts,
  getScheduleErrorMessage,
  scheduleConflictException,
  ScheduleConflict,
} from 'src/common/schedule-conflict';

export interface ScheduleAssignmentSnapshot {
  schedule_id: string;
  schedule_date: Date;
  service_type: string;
  slot_key: string;
  role: WorkerRole;
  worker_id: string;
  worker_name: string;
}

export interface PreparedScheduleSwap {
  source_snapshot: ScheduleAssignmentSnapshot;
  target_snapshot?: ScheduleAssignmentSnapshot;
  replacement_worker?: { _id: string; name: string };
  source_update: { schedule_id: string; assignments: any[] };
  target_update?: { schedule_id: string; assignments: any[] };
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly schedulesRepository: SchedulesRepository,
    private readonly workersService: WorkersService,
    private readonly scheduleAutoGenerationService: ScheduleAutoGenerationService,
    private readonly serviceTypesService: ServiceTypesService,
    private readonly workerUnavailabilityService: WorkerUnavailabilityService,
    @Optional()
    @Inject(forwardRef(() => PushNotificationsService))
    private readonly pushNotificationsService?: PushNotificationsService,
  ) {}

  async getAllSchedules(query: any = {}) {
    const filter: any = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.service_type) {
      filter.service_type = query.service_type;
    }

    return await this.schedulesRepository.getRecords(filter, 1, 100, 'asc', 'date');
  }

  async getMyAssignments(userId: string) {
    const worker = await this.workersService.findWorkerByUserId(userId);

    if (!worker) {
      return { worker: null, items: [] };
    }

    const items = await this.schedulesRepository.findWorkerAssignments(
      worker._id.toString(),
      this.getCurrentLocalDate(),
    );

    return {
      worker: {
        _id: worker._id,
        name: worker.name,
        roles: worker.roles,
        leader_songs: await this.workersService.getLegacyLeaderSongsForWorker(
          worker._id.toString(),
        ),
      },
      items,
    };
  }

  async getScheduleById(id: string) {
    const schedule = await this.schedulesRepository.getRecordById(id);

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async createSchedule(dto: CreateScheduleDTO) {
    const date = this.normalizeScheduleDate(dto.date);
    const serviceType = await this.serviceTypesService.getByCode(
      dto.service_type || 'main',
      true,
    );
    this.validateRecurrenceDate(date, serviceType);
    const existingSchedule = await this.schedulesRepository.findScheduleOnDate(
      date,
      serviceType.code,
    );

    if (existingSchedule) {
      const message = `A ${serviceType.name} schedule already exists for this date`;
      throw scheduleConflictException(message, [{
        code: 'SCHEDULE_ALREADY_EXISTS',
        date: date.toISOString().slice(0, 10),
        message,
        blocking_schedule: {
          id: existingSchedule._id.toString(),
          service_type: existingSchedule.service_type,
        },
      }]);
    }
    const assignments = await this.validateAndBuildAssignments(
      dto.assignments,
      date,
      serviceType,
    );

    return await this.schedulesRepository.insertRecord({
      date,
      service_type: serviceType.code,
      status: dto.status || this.getStatusForDate(date),
      assignments,
      songs: dto.songs || [],
      lineup: dto.lineup,
      notes: dto.notes,
    } as any);
  }

  async previewAutoGeneratedSchedules(dto: AutoGenerationPreviewDto) {
    return await this.scheduleAutoGenerationService.preview(dto);
  }

  async getAssignmentConstraints(yearValue: string, monthValue: string) {
    const year = Number(yearValue);
    const month = Number(monthValue);

    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new BadRequestException('Enter a valid year');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Enter a valid month');
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonthStart = new Date(Date.UTC(year, month, 1));
    const [schedules, unavailableWorkerIdsByDate] = await Promise.all([
      this.schedulesRepository.findSchedulesInDateRange(monthStart, nextMonthStart),
      this.workerUnavailabilityService.getUnavailableWorkerIds(
        monthStart,
        nextMonthStart,
      ),
    ]);
    const dates = new Map<string, Map<string, any>>();

    (schedules as any[]).forEach((schedule) => {
      const dateKey = new Date(schedule.date).toISOString().slice(0, 10);
      const blockedWorkers = dates.get(dateKey) ?? new Map<string, any>();
      (schedule.assignments ?? []).forEach((assignment: any) => {
        const workerId = assignment.worker_id.toString();
        blockedWorkers.set(`${workerId}:schedule:${schedule._id}`, {
          worker_id: workerId,
          worker_name: assignment.worker_name,
          code: 'WORKER_ALREADY_ASSIGNED',
          message: `${assignment.worker_name ?? 'This worker'} is already assigned to ${schedule.service_type} on this date`,
          blocking_schedule: {
            id: schedule._id.toString(),
            service_type: schedule.service_type,
            role: assignment.role,
            slot_key: assignment.slot_key,
          },
        });
      });
      dates.set(dateKey, blockedWorkers);
    });

    unavailableWorkerIdsByDate.forEach((workerIds, dateKey) => {
      const blockedWorkers = dates.get(dateKey) ?? new Map<string, any>();
      workerIds.forEach((workerId) => {
        blockedWorkers.set(`${workerId}:unavailable`, {
          worker_id: workerId,
          code: 'WORKER_UNAVAILABLE',
          message: 'This worker is unavailable on this date',
        });
      });
      dates.set(dateKey, blockedWorkers);
    });

    return {
      year,
      month,
      dates: [...dates.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([date, blockedWorkers]) => ({
          date,
          blocked_workers: [...blockedWorkers.values()],
        })),
    };
  }

  async confirmAutoGeneratedSchedules(dto: AutoGenerationConfirmDto) {
    const results: Array<{
      date: string;
      service_type: string;
      status: 'created' | 'failed';
      schedule?: any;
      message?: string;
      conflicts?: ScheduleConflict[];
    }> = [];

    for (const schedule of dto.schedules) {
      let dateKey = schedule.date.slice(0, 10);
      const requestedServiceType = schedule.service_type || 'main';
      try {
        const date = this.normalizeScheduleDate(schedule.date);
        dateKey = date.toISOString().slice(0, 10);
        const serviceType = await this.serviceTypesService.getByCode(
          requestedServiceType,
          true,
        );

        if (!(await this.scheduleAutoGenerationService.isGenerationDate(serviceType.code, date))) {
          const message = `${dateKey} is not a valid auto-generation date for ${serviceType.name}`;
          throw scheduleConflictException(message, [{
            code: 'INVALID_SCHEDULE_DATE',
            date: dateKey,
            message,
          }]);
        }

        const existingSchedule = await this.schedulesRepository.findScheduleOnDate(
          date,
          serviceType.code,
        );
        if (existingSchedule) {
          const message = `A ${serviceType.name} schedule already exists for ${dateKey}`;
          throw scheduleConflictException(message, [{
            code: 'SCHEDULE_ALREADY_EXISTS',
            date: dateKey,
            message,
            blocking_schedule: {
              id: existingSchedule._id.toString(),
              service_type: existingSchedule.service_type,
            },
          }]);
        }

        const assignments = await this.validateAndBuildAssignments(
          schedule.assignments,
          date,
          serviceType,
        );
        const created = await this.schedulesRepository.insertRecord({
          date,
          service_type: serviceType.code,
          status: this.getStatusForDate(date),
          assignments,
          songs: schedule.songs || [],
          lineup: schedule.lineup,
          notes: schedule.notes,
        } as any);
        results.push({
          date: dateKey,
          service_type: serviceType.code,
          status: 'created',
          schedule: created,
        });
      } catch (error) {
        results.push({
          date: dateKey,
          service_type: requestedServiceType,
          status: 'failed',
          message: getScheduleErrorMessage(error),
          conflicts: getScheduleConflicts(error, dateKey),
        });
      }
    }

    const created = results.filter((result) => result.status === 'created').length;
    return {
      items: results,
      summary: {
        submitted: results.length,
        created,
        failed: results.length - created,
      },
    };
  }

  async updateScheduleById(id: string, dto: UpdateScheduleDto) {
    const existing = await this.getScheduleById(id);
    const date = dto.date ? this.normalizeScheduleDate(dto.date) : existing.date;
    const serviceType = await this.serviceTypesService.getByCode(
      dto.service_type || existing.service_type || 'main',
      Boolean(dto.service_type),
    );
    this.validateRecurrenceDate(date, serviceType);
    const conflictingSchedule =
      await this.schedulesRepository.findScheduleOnDate(
        date,
        serviceType.code,
        id,
      );

    if (conflictingSchedule) {
      const message = `A ${serviceType.name} schedule already exists for this date`;
      throw scheduleConflictException(message, [{
        code: 'SCHEDULE_ALREADY_EXISTS',
        date: date.toISOString().slice(0, 10),
        message,
        blocking_schedule: {
          id: conflictingSchedule._id.toString(),
          service_type: conflictingSchedule.service_type,
        },
      }]);
    }
    const update: any = { ...dto, date };

    if (dto.assignments || dto.date || dto.service_type) {
      const assignments = dto.assignments ?? existing.assignments.map(
        (assignment) => ({
          slot_key: assignment.slot_key,
          role: assignment.role,
          worker_id: assignment.worker_id.toString(),
        }),
      );
      update.assignments = await this.validateAndBuildAssignments(
        assignments,
        date,
        serviceType,
        id,
      );
    }

    const schedule = await this.schedulesRepository.updateRecord(
      { _id: id } as any,
      update,
    );

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (this.pushNotificationsService) {
      try {
        await this.pushNotificationsService.notifyScheduleModified(
          existing as any,
          schedule as any,
        );
      } catch (error) {
        this.logger.error(
          `Could not notify affected workers for schedule ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return schedule;
  }

  async updateScheduleLineup(
    id: string,
    dto: UpdateScheduleLineupDto | string,
    userId: string,
    userRole: UserRole,
  ) {
    const schedule = await this.getScheduleById(id);

    if (typeof dto === 'string') {
      if (userRole !== UserRole.Admin && userRole !== UserRole.SuperAdmin) {
        const worker = await this.workersService.findWorkerByUserId(userId);
        const allowed = worker && schedule.assignments.some((assignment) =>
          assignment.role === WorkerRole.Leader &&
          assignment.worker_id.toString() === worker._id.toString(),
        );
        if (!allowed) {
          throw new ForbiddenException(
            'Only the assigned leader can edit this schedule lineup',
          );
        }
      }
      const legacySchedule = await this.schedulesRepository.updateRecord(
        { _id: id } as any,
        { lineup: dto.trim() } as any,
      );
      if (!legacySchedule) throw new NotFoundException('Schedule not found');
      return legacySchedule;
    }

    const leaderAssignment = schedule.assignments.find((assignment) => {
      return assignment.role === WorkerRole.Leader;
    });
    if (!leaderAssignment) {
      throw new BadRequestException('This schedule has no assigned leader');
    }

    let leaderWorkerId = leaderAssignment.worker_id.toString();

    if (
      userRole !== UserRole.Admin &&
      userRole !== UserRole.SuperAdmin
    ) {
      const worker = await this.workersService.findWorkerByUserId(userId);
      const isAssignedLeader = worker && schedule.assignments.some((assignment) => {
        return (
          assignment.role === WorkerRole.Leader &&
          assignment.worker_id.toString() === worker._id.toString()
        );
      });

      if (!isAssignedLeader) {
        throw new ForbiddenException(
          'Only the assigned leader can edit this schedule lineup',
        );
      }
      if (
        schedule.status !== ScheduleStatus.Active ||
        new Date(schedule.date) < this.getCurrentLocalDate()
      ) {
        throw new ForbiddenException(
          'Leaders can edit lineups only for active upcoming schedules',
        );
      }
      leaderWorkerId = worker!._id.toString();
    }

    const spotifyUrl = dto.spotify_url?.trim() || '';
    if (spotifyUrl) this.assertSpotifyUrl(spotifyUrl);

    const songs = [] as any[];
    for (const song of dto.songs) {
      songs.push(
        await this.workersService.resolveLeaderLineupSong(leaderWorkerId, song),
      );
    }

    const normalizedCurrent = JSON.stringify({
      songs: (schedule.songs ?? []).map((song) => ({
        song_id: (song as any).song_id?.toString(),
        title: song.title,
        artist: (song as any).artist || undefined,
        key: song.key || undefined,
      })),
      spotify_url: schedule.lineup || '',
    });
    const normalizedNext = JSON.stringify({
      songs: songs.map((song) => ({
        ...song,
        song_id: song.song_id?.toString(),
      })),
      spotify_url: spotifyUrl,
    });
    if (normalizedCurrent === normalizedNext) return schedule;
    const wasPublished = Boolean(schedule.songs?.length);

    const updatedSchedule = await this.schedulesRepository.updateRecord(
      { _id: id } as any,
      { songs, lineup: spotifyUrl } as any,
    );

    if (!updatedSchedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (this.pushNotificationsService) {
      try {
        await this.pushNotificationsService.notifyLineupPublished(
          updatedSchedule as any,
          wasPublished,
        );
      } catch (error) {
        this.logger.error(
          `Could not notify recipients for lineup ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return updatedSchedule;
  }

  private assertSpotifyUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Enter a valid Spotify link');
    }
    if (
      url.protocol !== 'https:' ||
      !['open.spotify.com', 'spotify.link'].includes(url.hostname.toLowerCase())
    ) {
      throw new BadRequestException('Enter an HTTPS Spotify share link');
    }
  }

  async deleteScheduleById(id: string) {
    const result = await this.schedulesRepository.deleteRecord({ _id: id } as any);

    if (!result.deletedCount) {
      throw new NotFoundException('Schedule not found');
    }

    return result;
  }

  async getSwapOptions(
    requesterWorkerId: string,
    mode: SwapMode,
    sourceScheduleId: string,
    sourceSlotKey: string,
  ) {
    const source = await this.getRequestableAssignment(
      requesterWorkerId,
      sourceScheduleId,
      sourceSlotKey,
    );

    if (mode === SwapMode.Replacement) {
      const workers = await this.workersService.getWorkers(WorkerStatus.Active);
      const options: Array<{ worker_id: string; worker_name: string }> = [];

      for (const worker of workers.items as any[]) {
        const workerId = worker._id.toString();
        if (workerId === requesterWorkerId) continue;

        const consentTarget = await this.workersService.getConsentEligibleWorker(workerId);
        if (!consentTarget) continue;

        try {
          await this.prepareSwap(
            requesterWorkerId,
            mode,
            sourceScheduleId,
            sourceSlotKey,
            workerId,
          );
          options.push({ worker_id: workerId, worker_name: worker.name });
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
        }
      }

      return { source: source.snapshot, options };
    }

    const schedules = await this.schedulesRepository.findActiveSchedulesFromDate(
      this.getCurrentLocalDate(),
    );
    const options: ScheduleAssignmentSnapshot[] = [];

    for (const schedule of schedules as any[]) {
      for (const assignment of schedule.assignments ?? []) {
        const workerId = assignment.worker_id.toString();
        if (workerId === requesterWorkerId) continue;

        const consentTarget = await this.workersService.getConsentEligibleWorker(workerId);
        if (!consentTarget) continue;

        try {
          const prepared = await this.prepareSwap(
            requesterWorkerId,
            mode,
            sourceScheduleId,
            sourceSlotKey,
            workerId,
            schedule._id.toString(),
            assignment.slot_key,
          );
          if (prepared.target_snapshot) options.push(prepared.target_snapshot);
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
        }
      }
    }

    return { source: source.snapshot, options };
  }

  async prepareSwap(
    requesterWorkerId: string,
    mode: SwapMode,
    sourceScheduleId: string,
    sourceSlotKey: string,
    targetWorkerId?: string,
    targetScheduleId?: string,
    targetSlotKey?: string,
    session?: ClientSession,
  ): Promise<PreparedScheduleSwap> {
    const source = await this.getRequestableAssignment(
      requesterWorkerId,
      sourceScheduleId,
      sourceSlotKey,
      session,
    );
    const excludedScheduleIds = [sourceScheduleId];

    if (mode === SwapMode.Replacement) {
      if (!targetWorkerId || targetWorkerId === requesterWorkerId) {
        throw new BadRequestException('Select a different replacement worker');
      }

      const sourceAssignments = this.replaceAssignmentWorker(
        source.schedule.assignments,
        sourceSlotKey,
        requesterWorkerId,
        targetWorkerId,
      );
      const serviceType = await this.serviceTypesService.getByCode(
        source.schedule.service_type,
        true,
      );
      const assignments = await this.validateAndBuildAssignments(
        sourceAssignments,
        source.schedule.date,
        serviceType,
        excludedScheduleIds,
        session,
      );
      const replacement = await this.workersService.getWorkerById(targetWorkerId);

      return {
        source_snapshot: source.snapshot,
        replacement_worker: {
          _id: replacement._id.toString(),
          name: replacement.name,
        },
        source_update: { schedule_id: sourceScheduleId, assignments },
      };
    }

    if (!targetScheduleId || !targetSlotKey) {
      throw new BadRequestException('Select an assignment to exchange');
    }

    const targetSchedule = targetScheduleId === sourceScheduleId
      ? source.schedule
      : await this.getRequestableSchedule(targetScheduleId, session);
    const targetAssignment = this.findAssignment(
      targetSchedule,
      targetSlotKey,
      targetWorkerId,
    );
    const targetWorkerIdValue = targetAssignment.worker_id.toString();

    if (targetWorkerIdValue === requesterWorkerId) {
      throw new BadRequestException('Select another worker assignment');
    }

    const targetSnapshot = this.toSnapshot(targetSchedule, targetAssignment);

    if (targetScheduleId === sourceScheduleId) {
      const projected = this.swapWorkersInAssignments(
        source.schedule.assignments,
        sourceSlotKey,
        requesterWorkerId,
        targetSlotKey,
        targetWorkerIdValue,
      );
      const serviceType = await this.serviceTypesService.getByCode(
        source.schedule.service_type,
        true,
      );
      const assignments = await this.validateAndBuildAssignments(
        projected,
        source.schedule.date,
        serviceType,
        excludedScheduleIds,
        session,
      );

      return {
        source_snapshot: source.snapshot,
        target_snapshot: targetSnapshot,
        source_update: { schedule_id: sourceScheduleId, assignments },
      };
    }

    excludedScheduleIds.push(targetScheduleId);
    const projectedSource = this.replaceAssignmentWorker(
      source.schedule.assignments,
      sourceSlotKey,
      requesterWorkerId,
      targetWorkerIdValue,
    );
    const projectedTarget = this.replaceAssignmentWorker(
      targetSchedule.assignments,
      targetSlotKey,
      targetWorkerIdValue,
      requesterWorkerId,
    );
    const [sourceServiceType, targetServiceType] = await Promise.all([
      this.serviceTypesService.getByCode(source.schedule.service_type, true),
      this.serviceTypesService.getByCode(targetSchedule.service_type, true),
    ]);
    const [sourceAssignments, targetAssignments] = await Promise.all([
      this.validateAndBuildAssignments(
        projectedSource,
        source.schedule.date,
        sourceServiceType,
        excludedScheduleIds,
        session,
      ),
      this.validateAndBuildAssignments(
        projectedTarget,
        targetSchedule.date,
        targetServiceType,
        excludedScheduleIds,
        session,
      ),
    ]);

    if (
      source.schedule.date.getTime() === targetSchedule.date.getTime() &&
      this.haveCrossScheduleDuplicate(sourceAssignments, targetAssignments)
    ) {
      throw new BadRequestException(
        'A worker cannot serve in multiple schedules on the same date',
      );
    }

    return {
      source_snapshot: source.snapshot,
      target_snapshot: targetSnapshot,
      source_update: { schedule_id: sourceScheduleId, assignments: sourceAssignments },
      target_update: { schedule_id: targetScheduleId, assignments: targetAssignments },
    };
  }

  async executePreparedSwap(prepared: PreparedScheduleSwap, session: ClientSession) {
    const source = await this.schedulesRepository.updateAssignments(
      prepared.source_update.schedule_id,
      prepared.source_update.assignments,
      session,
    );
    const target = prepared.target_update
      ? await this.schedulesRepository.updateAssignments(
          prepared.target_update.schedule_id,
          prepared.target_update.assignments,
          session,
        )
      : undefined;

    if (!source || (prepared.target_update && !target)) {
      throw new NotFoundException('A schedule changed before the swap was saved');
    }

    return { source, target };
  }

  async getWorkerAssignmentsOnDate(
    workerId: string,
    date: Date,
    session?: ClientSession,
  ) {
    return await this.schedulesRepository.findWorkerAssignmentsOnDate(
      workerId,
      date,
      session,
    );
  }

  async getActiveSchedulesInDateRange(startDate: Date, endDate: Date) {
    return await this.schedulesRepository.findActiveSchedulesInDateRange(
      startDate,
      endDate,
    );
  }

  @Cron('0 0 * * 1', {
    timeZone: process.env.CHURCH_TIMEZONE || 'Asia/Manila',
  })
  async syncPastScheduleStatuses() {
    const throughDate = this.getLastCompletedLocalDate(new Date());

    if (!throughDate) {
      return { modifiedCount: 0 };
    }

    return await this.schedulesRepository.markSchedulesInactiveThroughDate(
      throughDate,
    );
  }

  private async getRequestableAssignment(
    workerId: string,
    scheduleId: string,
    slotKey: string,
    session?: ClientSession,
  ) {
    const schedule = await this.getRequestableSchedule(scheduleId, session);
    const assignment = this.findAssignment(schedule, slotKey, workerId);

    if (assignment.worker_id.toString() !== workerId) {
      throw new ForbiddenException(
        'You can only request a swap for your own assignment',
      );
    }

    return { schedule, assignment, snapshot: this.toSnapshot(schedule, assignment) };
  }

  private async getRequestableSchedule(id: string, session?: ClientSession) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Schedule not found');
    const schedule = await this.schedulesRepository.getById(id, session);

    if (!schedule) throw new NotFoundException('Schedule not found');
    if (
      schedule.status !== ScheduleStatus.Active ||
      schedule.date < this.getCurrentLocalDate()
    ) {
      throw new BadRequestException('Only current or future active assignments can be swapped');
    }

    return schedule as any;
  }

  private findAssignment(schedule: any, slotKey: string, workerId?: string) {
    const assignment = schedule.assignments?.find(
      (item) =>
        item.slot_key === slotKey &&
        (!workerId || item.worker_id.toString() === workerId),
    );
    if (!assignment) throw new BadRequestException('Schedule assignment not found');
    return assignment;
  }

  private toSnapshot(schedule: any, assignment: any): ScheduleAssignmentSnapshot {
    return {
      schedule_id: schedule._id.toString(),
      schedule_date: schedule.date,
      service_type: schedule.service_type,
      slot_key: assignment.slot_key,
      role: assignment.role,
      worker_id: assignment.worker_id.toString(),
      worker_name: assignment.worker_name,
    };
  }

  private replaceAssignmentWorker(
    assignments: any[],
    slotKey: string,
    currentWorkerId: string,
    replacementWorkerId: string,
  ): ScheduleAssignmentDto[] {
    return assignments.map((assignment) => ({
      slot_key: assignment.slot_key,
      role: assignment.role,
      worker_id:
        assignment.slot_key === slotKey &&
        assignment.worker_id.toString() === currentWorkerId
          ? replacementWorkerId
          : assignment.worker_id.toString(),
    }));
  }

  private swapWorkersInAssignments(
    assignments: any[],
    sourceSlotKey: string,
    sourceWorkerId: string,
    targetSlotKey: string,
    targetWorkerId: string,
  ) {
    const source = this.findAssignment(
      { assignments },
      sourceSlotKey,
      sourceWorkerId,
    );
    const target = this.findAssignment(
      { assignments },
      targetSlotKey,
      targetWorkerId,
    );

    return assignments.map((assignment) => ({
      slot_key: assignment.slot_key,
      role: assignment.role,
      worker_id: assignment.slot_key === sourceSlotKey &&
        assignment.worker_id.toString() === sourceWorkerId
        ? target.worker_id.toString()
        : assignment.slot_key === targetSlotKey &&
            assignment.worker_id.toString() === targetWorkerId
          ? source.worker_id.toString()
          : assignment.worker_id.toString(),
    }));
  }

  private haveCrossScheduleDuplicate(first: any[], second: any[]) {
    const firstWorkerIds = new Set(first.map((assignment) => assignment.worker_id.toString()));
    return second.some((assignment) => firstWorkerIds.has(assignment.worker_id.toString()));
  }

  private async validateAndBuildAssignments(
    assignments: ScheduleAssignmentDto[],
    date: Date,
    serviceType: any,
    excludeScheduleIds?: string | string[],
    session?: ClientSession,
  ) {
    const dateKey = date.toISOString().slice(0, 10);
    if (!assignments?.length) {
      throw scheduleConflictException('At least one assignment is required', [{
        code: 'MISSING_REQUIRED_ASSIGNMENT',
        date: dateKey,
        message: 'At least one assignment is required',
      }]);
    }

    const slottedAssignments = this.validateServiceStructure(
      assignments,
      serviceType,
      dateKey,
    );
    this.validateNoDuplicateWorkers(slottedAssignments, dateKey);

    const workerIds = slottedAssignments.map(
      (assignment) => new Types.ObjectId(assignment.worker_id),
    );
    const conflict = await this.schedulesRepository.findWorkerConflictOnDate(
      date,
      workerIds,
      excludeScheduleIds,
      session,
    );

    if (conflict) {
      const requestedByWorker = new Map(
        slottedAssignments.map((assignment) => [assignment.worker_id, assignment]),
      );
      const conflicts = (conflict.assignments ?? [])
        .filter((assignment: any) => requestedByWorker.has(assignment.worker_id.toString()))
        .map((assignment: any) => {
          const requested = requestedByWorker.get(assignment.worker_id.toString())!;
          const workerName = assignment.worker_name ?? 'This worker';
          return {
            code: 'WORKER_ALREADY_ASSIGNED' as const,
            date: dateKey,
            worker_id: assignment.worker_id.toString(),
            worker_name: assignment.worker_name,
            slot_key: requested.slot_key,
            role: requested.role,
            message: `${workerName} is already assigned to ${conflict.service_type ?? 'another service'} as ${assignment.role}`,
            blocking_schedule: {
              id: conflict._id.toString(),
              service_type: conflict.service_type ?? 'another service',
              role: assignment.role,
              slot_key: assignment.slot_key,
            },
          };
        });
      throw scheduleConflictException(
        'A worker is already assigned to another schedule on this date',
        conflicts.length ? conflicts : [{
          code: 'WORKER_ALREADY_ASSIGNED',
          date: dateKey,
          message: 'A worker is already assigned to another schedule on this date',
        }],
      );
    }

    await this.workerUnavailabilityService.assertWorkersAvailable(
      workerIds.map(String),
      date,
      session,
    );

    return await Promise.all(
      slottedAssignments.map(async (assignment) => {
        const worker = await this.workersService.getWorkerById(
          assignment.worker_id,
        );

        if (worker.status !== WorkerStatus.Active) {
          const message = `Inactive workers cannot be assigned: ${worker.name}`;
          throw scheduleConflictException(message, [{
            code: 'INVALID_ASSIGNMENT',
            date: dateKey,
            worker_id: assignment.worker_id,
            worker_name: worker.name,
            slot_key: assignment.slot_key,
            role: assignment.role,
            message,
          }]);
        }

        if (!worker.roles?.includes(assignment.role)) {
          const message = `${worker.name} cannot be assigned to ${assignment.role}`;
          throw scheduleConflictException(message, [{
            code: 'INVALID_ASSIGNMENT',
            date: dateKey,
            worker_id: assignment.worker_id,
            worker_name: worker.name,
            slot_key: assignment.slot_key,
            role: assignment.role,
            message,
          }]);
        }

        const slot = serviceType.assignment_slots.find(
          (item) => item.key === assignment.slot_key,
        );
        const eligibility =
          slot?.worker_eligibility_override ??
          serviceType.worker_eligibility;
        const workerGroupIds = await this.workersService.getWorkerGroupIds(
          worker,
        );

        if (!this.isWorkerEligible(workerGroupIds, eligibility)) {
          const message = `${worker.name} is not eligible for ${slot?.label ?? assignment.role} in ${serviceType.name}`;
          throw scheduleConflictException(message, [{
            code: 'INVALID_ASSIGNMENT',
            date: dateKey,
            worker_id: assignment.worker_id,
            worker_name: worker.name,
            slot_key: assignment.slot_key,
            slot_label: slot?.label,
            role: assignment.role,
            message,
          }]);
        }

        return {
          slot_key: assignment.slot_key,
          role: assignment.role,
          worker_id: new Types.ObjectId(assignment.worker_id),
          worker_name: worker.name,
        };
      }),
    );
  }

  private validateServiceStructure(
    assignments: ScheduleAssignmentDto[],
    serviceType: any,
    dateKey: string,
  ) {
    const slots = [...serviceType.assignment_slots].sort(
      (a, b) => a.display_order - b.display_order,
    );
    const usedSlotKeys = new Set<string>();
    const resolved = assignments.map((assignment) => {
      const slot = assignment.slot_key
        ? slots.find((item) => item.key === assignment.slot_key)
        : slots.find(
            (item) =>
              (!usedSlotKeys.has(item.key) || item.allow_multiple) &&
              item.allowed_roles.includes(assignment.role),
          );

      if (!slot || !slot.allowed_roles.includes(assignment.role)) {
        const message = `${assignment.role} is not supported by ${serviceType.name}`;
        throw scheduleConflictException(message, [{
          code: 'INVALID_ASSIGNMENT',
          date: dateKey,
          worker_id: assignment.worker_id,
          slot_key: assignment.slot_key,
          role: assignment.role,
          message,
        }]);
      }

      if (usedSlotKeys.has(slot.key) && !slot.allow_multiple) {
        const message = `Assignment slot "${slot.label}" can only be filled once`;
        throw scheduleConflictException(message, [{
          code: 'INVALID_ASSIGNMENT',
          date: dateKey,
          worker_id: assignment.worker_id,
          slot_key: slot.key,
          slot_label: slot.label,
          role: assignment.role,
          message,
        }]);
      }

      usedSlotKeys.add(slot.key);
      return { ...assignment, slot_key: slot.key };
    });
    const missingSlots = slots.filter(
      (slot) => slot.required && !usedSlotKeys.has(slot.key),
    );

    if (missingSlots.length) {
      const message = `Missing required assignments: ${missingSlots.map((slot) => slot.label).join(', ')}`;
      throw scheduleConflictException(message, missingSlots.map((slot) => ({
        code: 'MISSING_REQUIRED_ASSIGNMENT',
        date: dateKey,
        slot_key: slot.key,
        slot_label: slot.label,
        message: `Missing required assignment: ${slot.label}`,
      })));
    }

    return resolved;
  }

  private validateNoDuplicateWorkers(
    assignments: ScheduleAssignmentDto[],
    dateKey: string,
  ) {
    const rolesByWorker = assignments.reduce<Map<string, WorkerRole[]>>(
      (roles, assignment) => {
        const workerRoles = roles.get(assignment.worker_id) ?? [];
        workerRoles.push(assignment.role);
        roles.set(assignment.worker_id, workerRoles);
        return roles;
      },
      new Map(),
    );
    const duplicateWorker = [...rolesByWorker.entries()].find(([, roles]) => {
      if (roles.length === 1) {
        return false;
      }

      const roleSet = new Set(roles);
      return !(
        roles.length === 2 &&
        roleSet.has(WorkerRole.Acoustic) &&
        (roleSet.has(WorkerRole.Leader) || roleSet.has(WorkerRole.Backup))
      );
    });

    if (duplicateWorker) {
      const message = 'A worker cannot be assigned to multiple roles in the same schedule, except Leader/Acoustic or Backup/Acoustic';
      throw scheduleConflictException(message, [{
        code: 'DUPLICATE_WORKER_ASSIGNMENT',
        date: dateKey,
        worker_id: duplicateWorker[0],
        message,
      }]);
    }
  }

  private isWorkerEligible(
    workerGroupIds: string[],
    eligibility: {
      mode: WorkerEligibilityMode;
      allowed_group_ids?: unknown[];
    },
  ) {
    if (eligibility.mode === WorkerEligibilityMode.Any) {
      return true;
    }

    const allowedIds = new Set(
      (eligibility.allowed_group_ids ?? []).map(String),
    );
    return workerGroupIds.some((id) => allowedIds.has(String(id)));
  }

  private validateRecurrenceDate(date: Date, serviceType: any) {
    if (
      serviceType.recurrence.type === 'weekly' &&
      date.getUTCDay() !== serviceType.recurrence.weekday
    ) {
      const message = `${serviceType.name} schedules must be assigned on the configured weekday`;
      throw scheduleConflictException(message, [{
        code: 'INVALID_SCHEDULE_DATE',
        date: date.toISOString().slice(0, 10),
        message,
      }]);
    }
  }

  private normalizeScheduleDate(value: string | Date) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid schedule date');
    }

    date.setUTCHours(0, 0, 0, 0);

    return date;
  }

  private getStatusForDate(date: Date) {
    const throughDate = this.getLastCompletedLocalDate(new Date());

    if (throughDate && date <= throughDate) {
      return ScheduleStatus.Inactive;
    }

    return ScheduleStatus.Active;
  }

  private getLastCompletedLocalDate(now: Date) {
    const offsetMinutes = Number(process.env.CHURCH_TIMEZONE_OFFSET_MINUTES || 480);
    const localNow = new Date(now.getTime() + offsetMinutes * 60 * 1000);

    if (localNow.getUTCDay() === 0) {
      return null;
    }

    const completedLocalDate = new Date(
      Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate(),
      ),
    );

    completedLocalDate.setUTCDate(completedLocalDate.getUTCDate() - 1);

    return completedLocalDate;
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
}
