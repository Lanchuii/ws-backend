import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CreateWorkerGroupDto } from './dto/create-worker-group.dto';
import { UpdateWorkerGroupDto } from './dto/update-worker-group.dto';
import { WorkerGroupsRepository } from './repositories/worker-groups.repository';

const DEFAULT_WORKER_GROUPS = [
  { code: 'main', name: 'Main', display_order: 10 },
  { code: 'youth', name: 'Youth', display_order: 20 },
  { code: 'outreach', name: 'Outreach', display_order: 30 },
];

@Injectable()
export class WorkerGroupsService implements OnModuleInit {
  constructor(private readonly repository: WorkerGroupsRepository) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    await Promise.all(
      DEFAULT_WORKER_GROUPS.map((group) =>
        this.repository.createIfMissing(group),
      ),
    );
  }

  async getWorkerGroups() {
    return await this.repository.findAll();
  }

  async getByCodes(codes: string[]) {
    return await this.repository.findByCodes(codes);
  }

  async assertIdsExist(ids: string[]) {
    const uniqueIds = [...new Set(ids)];

    if (!uniqueIds.length) {
      return;
    }

    const groups = await this.repository.findByIds(uniqueIds);

    if (groups.length !== uniqueIds.length) {
      throw new NotFoundException('One or more worker groups do not exist');
    }
  }

  async createWorkerGroup(dto: CreateWorkerGroupDto) {
    const code = normalizeCode(dto.code);
    const existing = await this.repository.getRecord({ code } as any);

    if (existing) {
      throw new ConflictException('A worker group with this code already exists');
    }

    return await this.repository.insertRecord({
      code,
      name: dto.name.trim(),
      is_active: dto.is_active ?? true,
      display_order: dto.display_order ?? 0,
    } as any);
  }

  async updateWorkerGroup(id: string, dto: UpdateWorkerGroupDto) {
    const updated = await this.repository.updateRecord(
      { _id: id } as any,
      {
        ...dto,
        ...(dto.name ? { name: dto.name.trim() } : {}),
      } as any,
    );

    if (!updated) {
      throw new NotFoundException('Worker group not found');
    }

    return updated;
  }
}

const normalizeCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
