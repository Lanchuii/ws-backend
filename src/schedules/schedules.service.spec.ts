import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { ServiceType } from 'src/common/enums/service-type.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { WorkersService } from 'src/workers/workers.service';
import { SchedulesRepository } from './repositories/schedules.repository';
import { ScheduleAutoGenerationService } from './schedule-auto-generation.service';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let service: SchedulesService;
  const leaderId = new Types.ObjectId().toString();
  const acousticId = new Types.ObjectId().toString();
  const bassId = new Types.ObjectId().toString();
  const drumsId = new Types.ObjectId().toString();
  const beatboxId = new Types.ObjectId().toString();
  const backupId = new Types.ObjectId().toString();
  const keyboardId = new Types.ObjectId().toString();
  const leaderOnlyId = new Types.ObjectId().toString();
  const repository = {
    insertRecord: jest.fn(),
    getRecords: jest.fn(),
    getRecordById: jest.fn(),
    updateRecord: jest.fn(),
    deleteRecord: jest.fn(),
    findWorkerConflictOnDate: jest.fn(),
    findScheduleOnDate: jest.fn(),
    findWorkerAssignments: jest.fn(),
    markSchedulesInactiveThroughDate: jest.fn(),
  };
  const workersService = {
    getWorkerById: jest.fn(),
    findWorkerByUserId: jest.fn(),
  };
  const scheduleAutoGenerationService = {
    preview: jest.fn(),
    isGenerationDate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: SchedulesRepository, useValue: repository },
        { provide: WorkersService, useValue: workersService },
        {
          provide: ScheduleAutoGenerationService,
          useValue: scheduleAutoGenerationService,
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    jest.clearAllMocks();

    repository.findWorkerConflictOnDate.mockResolvedValue(null);
    repository.findScheduleOnDate.mockResolvedValue(null);
    repository.insertRecord.mockImplementation(async (data) => data);
    scheduleAutoGenerationService.isGenerationDate.mockReturnValue(true);
    workersService.findWorkerByUserId.mockResolvedValue(null);
    workersService.getWorkerById.mockImplementation(async (id: string) => {
      const workers = {
        [leaderId]: {
          _id: leaderId,
          name: 'Leader',
          roles: [WorkerRole.Leader, WorkerRole.Acoustic],
          status: WorkerStatus.Active,
        },
        [acousticId]: {
          _id: acousticId,
          name: 'Acoustic',
          roles: [WorkerRole.Acoustic],
          status: WorkerStatus.Active,
        },
        [bassId]: {
          _id: bassId,
          name: 'Bass',
          roles: [WorkerRole.Bass],
          status: WorkerStatus.Active,
        },
        [drumsId]: {
          _id: drumsId,
          name: 'Drums',
          roles: [WorkerRole.Drums],
          status: WorkerStatus.Active,
        },
        [beatboxId]: {
          _id: beatboxId,
          name: 'Beatbox',
          roles: [WorkerRole.Beatbox],
          status: WorkerStatus.Active,
        },
        [backupId]: {
          _id: backupId,
          name: 'Backup',
          roles: [WorkerRole.Backup, WorkerRole.Acoustic],
          status: WorkerStatus.Active,
        },
        [keyboardId]: {
          _id: keyboardId,
          name: 'Keyboard',
          roles: [WorkerRole.Keyboard],
          status: WorkerStatus.Active,
        },
        [leaderOnlyId]: {
          _id: leaderOnlyId,
          name: 'Leader Only',
          roles: [WorkerRole.Leader],
          status: WorkerStatus.Active,
        },
      };

      return workers[id];
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns upcoming assignments for the worker linked to the user', async () => {
    const linkedWorkerId = new Types.ObjectId();
    workersService.findWorkerByUserId.mockResolvedValue({
      _id: linkedWorkerId,
      name: 'Peter',
    });
    repository.findWorkerAssignments.mockResolvedValue([
      { date: new Date('2099-07-12'), assignments: [] },
    ]);

    const result = await service.getMyAssignments('user-id');

    expect(result.worker?.name).toBe('Peter');
    expect(result.items).toHaveLength(1);
    expect(repository.findWorkerAssignments).toHaveBeenCalledWith(
      linkedWorkerId.toString(),
      expect.any(Date),
    );
  });

  it('returns an empty assignment list when the user has no linked worker', async () => {
    workersService.findWorkerByUserId.mockResolvedValue(null);

    await expect(service.getMyAssignments('user-id')).resolves.toEqual({
      worker: null,
      items: [],
    });
  });

  it('allows the assigned leader to update a schedule lineup', async () => {
    const scheduleId = new Types.ObjectId().toString();
    repository.getRecordById.mockResolvedValue({
      _id: scheduleId,
      assignments: [
        {
          role: WorkerRole.Leader,
          worker_id: new Types.ObjectId(leaderId),
        },
      ],
    });
    workersService.findWorkerByUserId.mockResolvedValue({
      _id: new Types.ObjectId(leaderId),
    });
    repository.updateRecord.mockResolvedValue({
      _id: scheduleId,
      lineup: 'https://open.spotify.com/playlist/example',
    });

    const schedule = await service.updateScheduleLineup(
      scheduleId,
      ' https://open.spotify.com/playlist/example ',
      'user-id',
      UserRole.Member,
    );

    expect(schedule.lineup).toBe('https://open.spotify.com/playlist/example');
    expect(repository.updateRecord).toHaveBeenCalledWith(
      { _id: scheduleId },
      { lineup: 'https://open.spotify.com/playlist/example' },
    );
  });

  it('rejects lineup updates from members who are not the assigned leader', async () => {
    const scheduleId = new Types.ObjectId().toString();
    repository.getRecordById.mockResolvedValue({
      _id: scheduleId,
      assignments: [
        {
          role: WorkerRole.Leader,
          worker_id: new Types.ObjectId(leaderId),
        },
      ],
    });
    workersService.findWorkerByUserId.mockResolvedValue({
      _id: new Types.ObjectId(acousticId),
    });

    await expect(
      service.updateScheduleLineup(
        scheduleId,
        'New lineup',
        'user-id',
        UserRole.Member,
      ),
    ).rejects.toThrow('assigned leader');
  });

  it('creates a schedule when required roles are present', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Main,
      lineup: 'https://open.spotify.com/playlist/example',
      assignments: validAssignments(),
    });

    expect(schedule.assignments).toHaveLength(4);
    expect(schedule.lineup).toBe('https://open.spotify.com/playlist/example');
    expect(schedule.status).toBe(ScheduleStatus.Active);
    expect(repository.insertRecord).toHaveBeenCalled();
  });

  it('creates a non-main schedule with leader, acoustic, and beatbox roles', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Youth,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Acoustic, worker_id: acousticId },
        { role: WorkerRole.Beatbox, worker_id: beatboxId },
      ],
    });

    expect(schedule.assignments).toHaveLength(3);
    expect(schedule.service_type).toBe(ServiceType.Youth);
  });

  it('accepts drums as the percussion role for a non-main schedule', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Midweek,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Acoustic, worker_id: acousticId },
        { role: WorkerRole.Drums, worker_id: drumsId },
      ],
    });

    expect(schedule.assignments).toHaveLength(3);
  });

  it('accepts a keyboard player in the Midweek Acoustic/Keyboard slot', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-15',
      service_type: ServiceType.Midweek,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Keyboard, worker_id: keyboardId },
      ],
    });

    expect(schedule.assignments[1].role).toBe(WorkerRole.Keyboard);
  });

  it('allows a leader to cover Acoustic in the same schedule', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Main,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Acoustic, worker_id: leaderId },
        { role: WorkerRole.Bass, worker_id: bassId },
        { role: WorkerRole.Drums, worker_id: drumsId },
      ],
    });

    expect(schedule.assignments).toHaveLength(4);
  });

  it('allows a backup singer to cover Acoustic in the same schedule', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Main,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Backup, worker_id: backupId },
        { role: WorkerRole.Acoustic, worker_id: backupId },
        { role: WorkerRole.Bass, worker_id: bassId },
        { role: WorkerRole.Drums, worker_id: drumsId },
      ],
    });

    expect(schedule.assignments).toHaveLength(5);
  });

  it('rejects a Leader-only worker in the Acoustic slot', async () => {
    await expect(
      service.createSchedule({
        date: '2099-07-12',
        service_type: ServiceType.Main,
        assignments: [
          { role: WorkerRole.Leader, worker_id: leaderId },
          { role: WorkerRole.Acoustic, worker_id: leaderOnlyId },
          { role: WorkerRole.Bass, worker_id: bassId },
          { role: WorkerRole.Drums, worker_id: drumsId },
        ],
      }),
    ).rejects.toThrow('Leader Only cannot be assigned to Acoustic');
  });

  it('creates a non-main schedule with only its required roles', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Yanson,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Acoustic, worker_id: acousticId },
      ],
    });

    expect(schedule.assignments).toHaveLength(2);
  });

  it('rejects unsupported roles on a non-main schedule', async () => {
    await expect(
      service.createSchedule({
        date: '2099-07-12',
        service_type: ServiceType.SumAg,
        assignments: [
          { role: WorkerRole.Leader, worker_id: leaderId },
          { role: WorkerRole.Acoustic, worker_id: acousticId },
          { role: WorkerRole.Keyboard, worker_id: bassId },
        ],
      }),
    ).rejects.toThrow('only support Leader, Acoustic, Bass, and Drums/Beatbox');
  });

  it('rejects schedules missing required roles', async () => {
    await expect(
      service.createSchedule({
        date: '2099-07-12',
        service_type: ServiceType.Main,
        assignments: validAssignments().filter(
          (assignment) => assignment.role !== WorkerRole.Drums,
        ),
      }),
    ).rejects.toThrow('Missing required roles: Drums');
  });

  it('rejects duplicate worker assignments in the same schedule', async () => {
    await expect(
      service.createSchedule({
        date: '2099-07-12',
        assignments: [
          { role: WorkerRole.Leader, worker_id: leaderId },
          { role: WorkerRole.Acoustic, worker_id: acousticId },
          { role: WorkerRole.Bass, worker_id: leaderId },
          { role: WorkerRole.Drums, worker_id: drumsId },
        ],
      }),
    ).rejects.toThrow('multiple roles');
  });

  it('rejects worker date conflicts', async () => {
    repository.findWorkerConflictOnDate.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(
      service.createSchedule({
        date: '2099-07-12',
        assignments: validAssignments(),
      }),
    ).rejects.toThrow('already assigned');
  });

  it('rejects inactive workers', async () => {
    workersService.getWorkerById.mockImplementation(async (id: string) => ({
      _id: id,
      name: 'Inactive',
      roles: [WorkerRole.Leader, WorkerRole.Acoustic, WorkerRole.Bass, WorkerRole.Drums],
      status: id === leaderId ? WorkerStatus.Inactive : WorkerStatus.Active,
    }));

    await expect(
      service.createSchedule({
        date: '2099-07-12',
        assignments: validAssignments(),
      }),
    ).rejects.toThrow('Inactive workers');
  });

  it('rejects incomplete generated schedules during confirm', async () => {
    await expect(
      service.confirmAutoGeneratedSchedules({
        schedules: [
          {
            date: '2099-07-12',
            assignments: [
              { role: WorkerRole.Leader, worker_id: leaderId },
              { role: WorkerRole.Acoustic, worker_id: acousticId },
            ],
          },
        ],
      }),
    ).rejects.toThrow('Missing required roles: Bass, Drums');
  });

  it('confirms an auto-generated Youth schedule with its service type', async () => {
    const schedules = await service.confirmAutoGeneratedSchedules({
      schedules: [
        {
          date: '2099-07-11',
          service_type: ServiceType.Youth,
          assignments: [
            { role: WorkerRole.Leader, worker_id: leaderId },
            { role: WorkerRole.Acoustic, worker_id: acousticId },
            { role: WorkerRole.Drums, worker_id: drumsId },
          ],
        },
      ],
    });

    expect(schedules[0].service_type).toBe(ServiceType.Youth);
    expect(repository.findScheduleOnDate).toHaveBeenCalledWith(
      expect.any(Date),
      ServiceType.Youth,
    );
  });

  function validAssignments() {
    return [
      { role: WorkerRole.Leader, worker_id: leaderId },
      { role: WorkerRole.Acoustic, worker_id: acousticId },
      { role: WorkerRole.Bass, worker_id: bassId },
      { role: WorkerRole.Drums, worker_id: drumsId },
    ];
  }
});
