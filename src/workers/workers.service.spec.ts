import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { UsersService } from 'src/users/users.service';
import { WorkersRepository } from './repositories/workers.repository';
import { WorkersService } from './workers.service';
import { WorkerGroupsService } from 'src/worker-groups/worker-groups.service';
import { SongsService } from 'src/songs/songs.service';
import { LeaderRepertoireRepository } from './repositories/leader-repertoire.repository';

describe('WorkersService', () => {
  let service: WorkersService;
  const repository = {
    insertRecord: jest.fn(),
    getRecords: jest.fn(),
    getRecordById: jest.fn(),
    updateRecord: jest.fn(),
    deleteRecord: jest.fn(),
    findByUserId: jest.fn(),
    findWithLegacyLeaderSongs: jest.fn(),
    clearLegacyLeaderSongs: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const workerGroupsService = {
    ensureDefaults: jest.fn(),
    getByCodes: jest.fn(),
    assertIdsExist: jest.fn(),
  };
  const songsService = {
    findOrCreateSong: jest.fn(),
    getSongById: jest.fn(),
  };
  const leaderRepertoireRepository = {
    countByWorkers: jest.fn(),
    findByWorker: jest.fn(),
    findByWorkerAndSong: jest.fn(),
    insert: jest.fn(),
    upsert: jest.fn(),
    updateKey: jest.fn(),
    delete: jest.fn(),
    deleteByWorker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        { provide: WorkersRepository, useValue: repository },
        { provide: UsersService, useValue: usersService },
        { provide: WorkerGroupsService, useValue: workerGroupsService },
        { provide: SongsService, useValue: songsService },
        {
          provide: LeaderRepertoireRepository,
          useValue: leaderRepertoireRepository,
        },
      ],
    }).compile();

    service = module.get<WorkersService>(WorkersService);
    jest.clearAllMocks();
    repository.findByUserId.mockResolvedValue(null);
    repository.getRecordById.mockResolvedValue(null);
    usersService.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      role: UserRole.Member,
      is_active: true,
      is_verified: true,
    });
    workerGroupsService.getByCodes.mockResolvedValue([
      { _id: 'main-group-id', code: 'main' },
    ]);
    leaderRepertoireRepository.countByWorkers.mockResolvedValue(new Map());
    leaderRepertoireRepository.findByWorker.mockResolvedValue({
      items: [],
      pagination: { page: 0, per_page: 10, last_page: 0, total_rows: 0 },
    });
    leaderRepertoireRepository.findByWorkerAndSong.mockResolvedValue(null);
    leaderRepertoireRepository.deleteByWorker.mockResolvedValue({
      deletedCount: 0,
    });
    songsService.findOrCreateSong.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      title: 'Goodness of God',
      artist: '',
      is_active: true,
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an active worker with multiple roles', async () => {
    repository.insertRecord.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
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
    leaderRepertoireRepository.findByWorker.mockResolvedValue({
      items: [
        {
          key: 'G',
          song: { title: 'Goodness of God', artist: '' },
        },
      ],
      pagination: { page: 1, per_page: 500, last_page: 1, total_rows: 1 },
    });

    const worker = await service.updateMyLeaderSongs('user-id', [
      { title: 'Goodness of God', key: 'G' },
    ]);

    expect(worker.leader_songs).toEqual([
      { title: 'Goodness of God', key: 'G' },
    ]);
    expect(leaderRepertoireRepository.deleteByWorker).toHaveBeenCalledWith(
      'worker-id',
    );
    expect(leaderRepertoireRepository.upsert).toHaveBeenCalledWith(
      'worker-id',
      '507f1f77bcf86cd799439012',
      'G',
    );
  });

  it('adds an existing catalog song to a leader repertoire', async () => {
    repository.getRecordById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
      roles: [WorkerRole.Leader],
    });
    songsService.getSongById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      title: 'Holy Forever',
      artist: 'Chris Tomlin',
      is_active: true,
    });
    leaderRepertoireRepository.insert.mockResolvedValue({
      _id: '507f1f77bcf86cd799439014',
      worker_id: '507f1f77bcf86cd799439013',
      song_id: '507f1f77bcf86cd799439012',
      key: 'C',
    });

    const result = await service.addToWorkerRepertoire(
      '507f1f77bcf86cd799439013',
      {
        song_id: '507f1f77bcf86cd799439012',
        key: 'C',
      },
    );

    expect(result.song.title).toBe('Holy Forever');
    expect(leaderRepertoireRepository.insert).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439012',
      'C',
    );
  });

  it('adds a song through the authenticated linked leader', async () => {
    const workerId = '507f1f77bcf86cd799439013';
    repository.findByUserId.mockResolvedValue({
      _id: workerId,
      roles: [WorkerRole.Leader],
    });
    repository.getRecordById.mockResolvedValue({
      _id: workerId,
      roles: [WorkerRole.Leader],
    });
    songsService.getSongById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      title: 'Holy Forever',
      is_active: true,
    });
    leaderRepertoireRepository.insert.mockResolvedValue({
      _id: '507f1f77bcf86cd799439014',
      worker_id: workerId,
      song_id: '507f1f77bcf86cd799439012',
      key: 'C',
    });

    await service.addToMyRepertoire('linked-user-id', {
      song_id: '507f1f77bcf86cd799439012',
      key: 'C',
    });

    expect(repository.findByUserId).toHaveBeenCalledWith('linked-user-id');
    expect(leaderRepertoireRepository.insert).toHaveBeenCalledWith(
      workerId,
      '507f1f77bcf86cd799439012',
      'C',
    );
  });

  it('rejects adding the same catalog song twice', async () => {
    repository.getRecordById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
      roles: [WorkerRole.Leader],
    });
    songsService.getSongById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      title: 'Holy Forever',
      is_active: true,
    });
    leaderRepertoireRepository.findByWorkerAndSong.mockResolvedValue({
      _id: '507f1f77bcf86cd799439014',
    });

    await expect(
      service.addToWorkerRepertoire('507f1f77bcf86cd799439013', {
        song_id: '507f1f77bcf86cd799439012',
        key: 'C',
      }),
    ).rejects.toThrow('already in the leader repertoire');
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
