import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { LeaderSongDto } from './dto/leader-song.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersRepository } from './repositories/workers.repository';

@Injectable()
export class WorkersService {
  constructor(private readonly workersRepository: WorkersRepository) {}

  async createWorker(dto: CreateWorkerDto) {
    await this.ensureUserLinkIsAvailable(dto.user_id);
    const { user_id, ...workerData } = dto;

    return await this.workersRepository.insertRecord({
      ...workerData,
      ...(user_id ? { user_id } : {}),
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

    const linkedWorker = await this.workersRepository.findByUserId(userId);

    if (linkedWorker && linkedWorker._id.toString() !== excludeWorkerId) {
      throw new ConflictException('This user account is already linked to another worker');
    }
  }
}
