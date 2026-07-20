import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { UsersService } from 'src/users/users.service';
import { WorkersRepository } from './repositories/workers.repository';
import { WorkersService } from './workers.service';
import { WorkerGroupsService } from 'src/worker-groups/worker-groups.service';

describe('WorkersService', () => {
  let service: WorkersService;
  const repository = {
    insertRecord: jest.fn(),
    getRecords: jest.fn(),
    getRecordById: jest.fn(),
    updateRecord: jest.fn(),
    deleteRecord: jest.fn(),
    findByUserId: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const workerGroupsService = {
    ensureDefaults: jest.fn(),
    getByCodes: jest.fn(),
    assertIdsExist: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        { provide: WorkersRepository, useValue: repository },
        { provide: UsersService, useValue: usersService },
        { provide: WorkerGroupsService, useValue: workerGroupsService },
      ],
    }).compile();

    service = module.get<WorkersService>(WorkersService);
    jest.clearAllMocks();
    repository.findByUserId.mockResolvedValue(null);
    usersService.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      role: UserRole.Member,
      is_active: true,
      is_verified: true,
    });
    workerGroupsService.getByCodes.mockResolvedValue([
      { _id: 'main-group-id', code: 'main' },
    ]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an active worker with multiple roles', async () => {
    repository.insertRecord.mockResolvedValue({
      name: 'Peter',
      roles: [WorkerRole.Leader, WorkerRole.Acoustic],
      label: WorkerLabel.Main,
      status: WorkerStatus.Active,
      leader_songs: [],
      worker_group_ids: ['main-group-id'],
    });

    const worker = await service.createWorker({
      name: 'Peter',
      roles: [WorkerRole.Leader, WorkerRole.Acoustic],
    });

    expect(worker.roles).toEqual([WorkerRole.Leader, WorkerRole.Acoustic]);
    expect(repository.insertRecord).toHaveBeenCalledWith({
      name: 'Peter',
      roles: [WorkerRole.Leader, WorkerRole.Acoustic],
      label: WorkerLabel.Main,
      worker_group_ids: ['main-group-id'],
      status: WorkerStatus.Active,
      leader_songs: [],
    });
  });

  it('updates a worker', async () => {
    repository.updateRecord.mockResolvedValue({
      _id: 'worker-id',
      name: 'Peter',
      roles: [WorkerRole.Leader],
      status: WorkerStatus.Inactive,
      leader_songs: [],
    });

    const worker = await service.updateWorker('worker-id', {
      status: WorkerStatus.Inactive,
    });

    expect(worker.status).toBe(WorkerStatus.Inactive);
    expect(repository.updateRecord).toHaveBeenCalledWith(
      { _id: 'worker-id' },
      { status: WorkerStatus.Inactive },
    );
  });

  it('links a member account to a worker', async () => {
    repository.updateRecord.mockResolvedValue({
      _id: 'worker-id',
      user_id: '507f1f77bcf86cd799439011',
      name: 'Peter',
    });

    const worker = await service.updateWorker('worker-id', {
      user_id: '507f1f77bcf86cd799439011',
    });

    expect(worker.user_id).toBe('507f1f77bcf86cd799439011');
  });

  it('allows a linked leader to update their songs', async () => {
    repository.findByUserId.mockResolvedValue({
      _id: 'worker-id',
      roles: [WorkerRole.Leader],
    });
    repository.updateRecord.mockResolvedValue({
      _id: 'worker-id',
      roles: [WorkerRole.Leader],
      leader_songs: [{ title: 'Goodness of God', key: 'G' }],
    });

    const worker = await service.updateMyLeaderSongs('user-id', [
      { title: 'Goodness of God', key: 'G' },
    ]);

    expect(worker.leader_songs).toEqual([
      { title: 'Goodness of God', key: 'G' },
    ]);
    expect(repository.updateRecord).toHaveBeenCalledWith(
      { _id: 'worker-id' },
      { leader_songs: [{ title: 'Goodness of God', key: 'G' }] },
    );
  });

  it('rejects leader-song updates from a linked non-leader', async () => {
    repository.findByUserId.mockResolvedValue({
      _id: 'worker-id',
      roles: [WorkerRole.Bass],
    });

    await expect(
      service.updateMyLeaderSongs('user-id', []),
    ).rejects.toThrow('Only leaders');
  });

  it('rejects an account already linked to another worker', async () => {
    repository.findByUserId.mockResolvedValue({
      _id: 'another-worker-id',
      user_id: '507f1f77bcf86cd799439011',
    });

    await expect(
      service.updateWorker('worker-id', {
        user_id: '507f1f77bcf86cd799439011',
      }),
    ).rejects.toThrow('already linked');
  });

  it('rejects linking an unverified member account', async () => {
    usersService.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      role: UserRole.Member,
      is_active: true,
      is_verified: false,
    });

    await expect(
      service.updateWorker('worker-id', {
        user_id: '507f1f77bcf86cd799439011',
      }),
    ).rejects.toThrow('active, verified member');
  });

  it('deletes a worker', async () => {
    repository.deleteRecord.mockResolvedValue({ deletedCount: 1 });

    const result = await service.deleteWorker('worker-id');

    expect(result.deletedCount).toBe(1);
    expect(repository.deleteRecord).toHaveBeenCalledWith({ _id: 'worker-id' });
  });
});
