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
import { ServiceTypesService } from 'src/service-types/service-types.service';
import { WorkerEligibilityMode } from 'src/service-types/service-type.constants';
import { WorkerUnavailabilityService } from 'src/worker-unavailability/worker-unavailability.service';

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
    getWorkerGroupIds: jest.fn(),
    getLegacyLeaderSongsForWorker: jest.fn(),
    resolveLeaderLineupSong: jest.fn(),
  };
  const scheduleAutoGenerationService = {
    preview: jest.fn(),
    isGenerationDate: jest.fn(),
  };
  const serviceTypesService = {
    getByCode: jest.fn(),
  };
  const workerUnavailabilityService = {
    assertWorkersAvailable: jest.fn(),
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
        { provide: ServiceTypesService, useValue: serviceTypesService },
        {
          provide: WorkerUnavailabilityService,
          useValue: workerUnavailabilityService,
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
    workersService.getWorkerGroupIds.mockResolvedValue([]);
    workersService.getLegacyLeaderSongsForWorker.mockResolvedValue([]);
    serviceTypesService.getByCode.mockImplementation(async (code: string) => {
      return getServiceTypeConfiguration(code);
    });
    workerUnavailabilityService.assertWorkersAvailable.mockResolvedValue(undefined);
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

  it('publishes ordered structured songs with a Spotify link', async () => {
    const scheduleId = new Types.ObjectId().toString();
    const songId = new Types.ObjectId();
    repository.getRecordById.mockResolvedValue({
      _id: scheduleId,
      date: new Date('2099-09-06T00:00:00.000Z'),
      status: ScheduleStatus.Active,
      songs: [],
      assignments: [{
        role: WorkerRole.Leader,
        worker_id: new Types.ObjectId(leaderId),
      }],
    });
    workersService.findWorkerByUserId.mockResolvedValue({
      _id: new Types.ObjectId(leaderId),
    });
    workersService.resolveLeaderLineupSong.mockResolvedValue({
      song_id: songId,
      title: 'Grace',
      artist: 'Team',
      key: 'G',
    });
    repository.updateRecord.mockImplementation(async (_filter, update) => ({
      _id: scheduleId,
      ...update,
    }));

    const result = await service.updateScheduleLineup(
      scheduleId,
      {
        songs: [{ song_id: songId.toString(), key: 'G' }],
        spotify_url: 'https://open.spotify.com/playlist/example',
      },
      'user-id',
      UserRole.Member,
    );

    expect(result.songs[0]).toMatchObject({ title: 'Grace', key: 'G' });
    expect(result.lineup).toBe('https://open.spotify.com/playlist/example');
  });

  it('allows super admins to update any schedule lineup', async () => {
    const scheduleId = new Types.ObjectId().toString();
    repository.getRecordById.mockResolvedValue({
      _id: scheduleId,
      assignments: [],
    });
    repository.updateRecord.mockResolvedValue({
      _id: scheduleId,
      lineup: 'Updated by super admin',
    });

    const schedule = await service.updateScheduleLineup(
      scheduleId,
      'Updated by super admin',
      'super-admin-id',
      UserRole.SuperAdmin,
    );

    expect(schedule.lineup).toBe('Updated by super admin');
    expect(workersService.findWorkerByUserId).not.toHaveBeenCalled();
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
    expect(workerUnavailabilityService.assertWorkersAvailable).toHaveBeenCalled();
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

  it('rejects a schedule when an assigned worker is unavailable', async () => {
    workerUnavailabilityService.assertWorkersAvailable.mockRejectedValueOnce(
      new Error('unavailable'),
    );

    await expect(
      service.createSchedule({
        date: '2026-07-19',
        service_type: ServiceType.Main,
        assignments: validAssignments(),
      }),
    ).rejects.toThrow('unavailable');
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
    ).rejects.toThrow('Keyboard is not supported');
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
    ).rejects.toThrow('Missing required assignments: Drums');
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

  it('rejects a weekly service scheduled outside its configured weekday', async () => {
    const configured = getServiceTypeConfiguration(ServiceType.Main);
    serviceTypesService.getByCode.mockResolvedValue({
      ...configured,
      name: 'Monday Service',
      recurrence: {
        type: 'weekly',
        weekday:
          (new Date('2099-07-12T00:00:00Z').getUTCDay() + 1) % 7,
      },
    });

    await expect(
      service.createSchedule({
        date: '2099-07-12',
        service_type: ServiceType.Main,
        assignments: validAssignments(),
      }),
    ).rejects.toThrow('configured weekday');
  });

  it('rejects a worker outside the configured worker groups', async () => {
    const configured = getServiceTypeConfiguration(ServiceType.Main);
    serviceTypesService.getByCode.mockResolvedValue({
      ...configured,
      worker_eligibility: {
        mode: WorkerEligibilityMode.Groups,
        allowed_group_ids: ['allowed-group'],
        preferred_group_ids: ['allowed-group'],
      },
    });
    workersService.getWorkerGroupIds.mockResolvedValue(['different-group']);

    await expect(
      service.createSchedule({
        date: '2099-07-12',
        service_type: ServiceType.Main,
        assignments: validAssignments(),
      }),
    ).rejects.toThrow('not eligible');
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
    ).rejects.toThrow('Missing required assignments: Bass, Drums');
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

  function getServiceTypeConfiguration(code: string) {
    const eligibility = {
      mode: WorkerEligibilityMode.Any,
      allowed_group_ids: [],
      preferred_group_ids: [],
    };
    const slot = (
      key: string,
      label: string,
      allowed_roles: WorkerRole[],
      required: boolean,
      display_order: number,
    ) => ({ key, label, allowed_roles, required, display_order });
    const mainSlots = [
      slot('leader', 'Leader', [WorkerRole.Leader], true, 10),
      slot('backup', 'Backup', [WorkerRole.Backup], false, 20),
      slot('acoustic', 'Acoustic', [WorkerRole.Acoustic], true, 30),
      slot('electric', 'Electric', [WorkerRole.Electric], false, 40),
      slot('bass', 'Bass', [WorkerRole.Bass], true, 50),
      slot('keyboard', 'Keyboard', [WorkerRole.Keyboard], false, 60),
      slot('drums', 'Drums', [WorkerRole.Drums], true, 70),
    ];
    const nonMainSlots = [
      slot('leader', 'Leader', [WorkerRole.Leader], true, 10),
      slot(
        'instrument',
        code === ServiceType.Midweek ? 'Acoustic / Keyboard' : 'Acoustic',
        code === ServiceType.Midweek
          ? [WorkerRole.Acoustic, WorkerRole.Keyboard]
          : [WorkerRole.Acoustic],
        true,
        20,
      ),
      slot('bass', 'Bass', [WorkerRole.Bass], false, 30),
      slot(
        'percussion',
        'Drums / Beatbox',
        [WorkerRole.Drums, WorkerRole.Beatbox],
        false,
        40,
      ),
    ];

    return {
      code,
      name: `${code} service`,
      recurrence: { type: 'once' },
      worker_eligibility: eligibility,
      assignment_slots: code === ServiceType.Main ? mainSlots : nonMainSlots,
      is_active: true,
      auto_generation_enabled: true,
    };
  }
});
