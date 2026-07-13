import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersRepository } from './repositories/workers.repository';

@Injectable()
export class WorkersService {
  constructor(private readonly workersRepository: WorkersRepository) {}

  async createWorker(dto: CreateWorkerDto) {
    return await this.workersRepository.insertRecord({
      ...dto,
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

  async updateWorker(id: string, dto: UpdateWorkerDto) {
    const worker = await this.workersRepository.updateRecord({ _id: id } as any, dto as any);

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
}
