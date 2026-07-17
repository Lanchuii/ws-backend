import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { WorkersRepository } from './repositories/workers.repository';
import { WorkersService } from './workers.service';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        { provide: WorkersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<WorkersService>(WorkersService);
    jest.clearAllMocks();
    repository.findByUserId.mockResolvedValue(null);
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

  it('deletes a worker', async () => {
    repository.deleteRecord.mockResolvedValue({ deletedCount: 1 });

    const result = await service.deleteWorker('worker-id');

    expect(result.deletedCount).toBe(1);
    expect(repository.deleteRecord).toHaveBeenCalledWith({ _id: 'worker-id' });
  });
});
