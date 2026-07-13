import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { ServiceType } from 'src/common/enums/service-type.enum';
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
  const repository = {
    insertRecord: jest.fn(),
    getRecords: jest.fn(),
    getRecordById: jest.fn(),
    updateRecord: jest.fn(),
    deleteRecord: jest.fn(),
    findWorkerConflictOnDate: jest.fn(),
    findMainScheduleOnDate: jest.fn(),
    markSchedulesInactiveThroughDate: jest.fn(),
  };
  const workersService = {
    getWorkerById: jest.fn(),
  };
  const scheduleAutoGenerationService = {
    preview: jest.fn(),
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
    repository.findMainScheduleOnDate.mockResolvedValue(null);
    repository.insertRecord.mockImplementation(async (data) => data);
    workersService.getWorkerById.mockImplementation(async (id: string) => {
      const workers = {
        [leaderId]: {
          _id: leaderId,
          name: 'Leader',
          roles: [WorkerRole.Leader],
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
      };

      return workers[id];
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

  it('creates a non-main schedule with only leader and acoustic roles', async () => {
    const schedule = await service.createSchedule({
      date: '2099-07-12',
      service_type: ServiceType.Youth,
      assignments: [
        { role: WorkerRole.Leader, worker_id: leaderId },
        { role: WorkerRole.Acoustic, worker_id: acousticId },
      ],
    });

    expect(schedule.assignments).toHaveLength(2);
    expect(schedule.service_type).toBe(ServiceType.Youth);
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
          { role: WorkerRole.Acoustic, worker_id: leaderId },
          { role: WorkerRole.Bass, worker_id: bassId },
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

  function validAssignments() {
    return [
      { role: WorkerRole.Leader, worker_id: leaderId },
      { role: WorkerRole.Acoustic, worker_id: acousticId },
      { role: WorkerRole.Bass, worker_id: bassId },
      { role: WorkerRole.Drums, worker_id: drumsId },
    ];
  }
});
