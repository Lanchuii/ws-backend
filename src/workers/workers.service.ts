import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { LeaderSongDto } from './dto/leader-song.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersRepository } from './repositories/workers.repository';
import { UsersService } from 'src/users/users.service';
import { WorkerGroupsService } from 'src/worker-groups/worker-groups.service';

@Injectable()
export class WorkersService implements OnModuleInit {
  constructor(
    private readonly workersRepository: WorkersRepository,
    private readonly usersService: UsersService,
    private readonly workerGroupsService: WorkerGroupsService,
  ) {}

  async onModuleInit() {
    await this.workerGroupsService.ensureDefaults();
    const groups = await this.workerGroupsService.getByCodes(['main', 'youth']);
    const main = groups.find((group) => group.code === 'main');
    const youth = groups.find((group) => group.code === 'youth');

    if (main && youth) {
      await this.workersRepository.backfillLegacyWorkerGroups(
        main._id.toString(),
        youth._id.toString(),
      );
    }
  }

  async createWorker(dto: CreateWorkerDto) {
    await this.ensureUserLinkIsAvailable(dto.user_id);
    const workerGroupIds = await this.resolveSavedWorkerGroupIds(
      dto.worker_group_ids,
      dto.label,
    );
    const { user_id, ...workerData } = dto;

    return await this.workersRepository.insertRecord({
      ...workerData,
      ...(user_id ? { user_id } : {}),
      worker_group_ids: workerGroupIds,
      label: dto.label || WorkerLabel.Main,
      status: dto.status || WorkerStatus.Active,
      leader_songs: dto.leader_songs || [],
    } as any);
  }

  async getWorkers(status?: WorkerStatus) {
    const filter = status ? ({ status } as any) : {};

    return await this.workersRepository.getRecords(filter, 1, 100, 'asc', 'name');
  }

  async getWorkerById(id: string) {
    const worker = await this.workersRepository.getRecordById(id);

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    return worker;
  }

  async findWorkerByUserId(userId: string) {
    return await this.workersRepository.findByUserId(userId);
  }

  async updateMyLeaderSongs(userId: string, leaderSongs: LeaderSongDto[]) {
    const worker = await this.findWorkerByUserId(userId);

    if (!worker) {
      throw new ForbiddenException('Your account is not linked to a worker');
    }

    if (!worker.roles?.includes(WorkerRole.Leader)) {
      throw new ForbiddenException('Only leaders can manage leader songs');
    }

    const updatedWorker = await this.workersRepository.updateRecord(
      { _id: worker._id } as any,
      { leader_songs: leaderSongs } as any,
    );

    if (!updatedWorker) {
      throw new NotFoundException('Worker not found');
    }

    return updatedWorker;
  }

  async updateWorker(id: string, dto: UpdateWorkerDto) {
    await this.ensureUserLinkIsAvailable(dto.user_id, id);
    if (dto.worker_group_ids) {
      await this.workerGroupsService.assertIdsExist(dto.worker_group_ids);
    }

    const update = dto.user_id === null
      ? { $set: this.withoutUserId(dto), $unset: { user_id: 1 } }
      : dto;
    const worker = await this.workersRepository.updateRecord(
      { _id: id } as any,
      update as any,
    );

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    return worker;
  }

  async deleteWorker(id: string) {
    const result = await this.workersRepository.deleteRecord({ _id: id } as any);

    if (!result.deletedCount) {
      throw new NotFoundException('Worker not found');
    }

    return result;
  }

  private withoutUserId(dto: UpdateWorkerDto) {
    const update = { ...dto };
    delete update.user_id;
    return update;
  }

  private async ensureUserLinkIsAvailable(userId?: string | null, excludeWorkerId?: string) {
    if (!userId) {
      return;
    }

    const user = await this.usersService.findById(userId);

    if (
      !user ||
      user.role !== UserRole.Member ||
      !user.is_active ||
      user.is_verified === false
    ) {
      throw new BadRequestException(
        'Only active, verified member accounts can be linked to workers',
      );
    }

    const linkedWorker = await this.workersRepository.findByUserId(userId);

    if (linkedWorker && linkedWorker._id.toString() !== excludeWorkerId) {
      throw new ConflictException('This user account is already linked to another worker');
    }
  }

  async getWorkerGroupIds(worker: {
    worker_group_ids?: unknown[];
    label?: WorkerLabel;
  }) {
    if (worker.worker_group_ids?.length) {
      return worker.worker_group_ids.map(String);
    }

    const code = worker.label === WorkerLabel.Youth ? 'youth' : 'main';
    const groups = await this.workerGroupsService.getByCodes([code]);
    return groups.map((group) => group._id.toString());
  }

  private async resolveSavedWorkerGroupIds(
    ids?: string[],
    label?: WorkerLabel,
  ) {
    if (ids?.length) {
      await this.workerGroupsService.assertIdsExist(ids);
      return ids;
    }

    const code = label === WorkerLabel.Youth ? 'youth' : 'main';
    const groups = await this.workerGroupsService.getByCodes([code]);
    return groups.map((group) => group._id);
  }
}
