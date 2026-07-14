import { Test, TestingModule } from '@nestjs/testing';
import { ServiceType } from 'src/common/enums/service-type.enum';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { WorkersService } from 'src/workers/workers.service';
import { SchedulesRepository } from './repositories/schedules.repository';
import { ScheduleAutoGenerationService } from './schedule-auto-generation.service';

describe('ScheduleAutoGenerationService', () => {
  let service: ScheduleAutoGenerationService;
  const repository = {
    findSchedulesInDateRange: jest.fn(),
  };
  const workersService = {
    getWorkers: jest.fn(),
  };

  const workers = [
    worker('leader-main', 'Main Leader', [WorkerRole.Leader], WorkerLabel.Main),
    worker('leader-youth', 'Youth Leader', [WorkerRole.Leader], WorkerLabel.Youth),
    worker('acoustic-main-1', 'Main Acoustic 1', [WorkerRole.Acoustic], WorkerLabel.Main),
    worker('acoustic-main-2', 'Main Acoustic 2', [WorkerRole.Acoustic], WorkerLabel.Main),
    worker('bass-main', 'Main Bass', [WorkerRole.Bass], WorkerLabel.Main),
    worker('drums-main', 'Main Drums', [WorkerRole.Drums], WorkerLabel.Main),
    worker('backup-youth', 'Youth Backup', [WorkerRole.Backup], WorkerLabel.Youth),
    worker('electric-main', 'Main Electric', [WorkerRole.Electric], WorkerLabel.Main),
    worker('keyboard-main', 'Main Keyboard', [WorkerRole.Keyboard], WorkerLabel.Main),
    worker(
      'inactive-leader',
      'Inactive Leader',
      [WorkerRole.Leader],
      WorkerLabel.Main,
      WorkerStatus.Inactive,
    ),
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleAutoGenerationService,
        { provide: SchedulesRepository, useValue: repository },
        { provide: WorkersService, useValue: workersService },
      ],
    }).compile();

    service = module.get<ScheduleAutoGenerationService>(
      ScheduleAutoGenerationService,
    );
    jest.clearAllMocks();
    workersService.getWorkers.mockResolvedValue({ items: workers });
    repository.findSchedulesInDateRange.mockImplementation(
      async (_start, _end, serviceType?: ServiceType) => {
        return serviceType ? [] : [];
      },
    );
  });

  it('generates one preview row per Sunday in the selected month', async () => {
    const preview = await service.preview({ year: 2026, month: 7 });

    expect(preview.rows.map((row) => row.date)).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
    ]);
    expect(preview.rows.every((row) => row.service_type === ServiceType.Main)).toBe(
      true,
    );
  });

  it('generates Youth schedules for every Saturday', async () => {
    const preview = await service.preview({
      year: 2026,
      month: 8,
      service_type: ServiceType.Youth,
    });

    expect(preview.rows.map((row) => row.date)).toEqual([
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
      '2026-08-22',
      '2026-08-29',
    ]);
    expect(preview.rows.every((row) => row.service_type === ServiceType.Youth)).toBe(
      true,
    );
  });

  it('generates Midweek schedules for every Wednesday', async () => {
    const preview = await service.preview({
      year: 2026,
      month: 8,
      service_type: ServiceType.Midweek,
    });

    expect(preview.rows.map((row) => row.date)).toEqual([
      '2026-08-05',
      '2026-08-12',
      '2026-08-19',
      '2026-08-26',
    ]);
  });

  it('uses Keyboard when it is the available Midweek instrument', async () => {
    workersService.getWorkers.mockResolvedValue({
      items: workers.filter((item) => {
        return ['leader-main', 'keyboard-main'].includes(item._id);
      }),
    });

    const preview = await service.preview({
      year: 2026,
      month: 8,
      service_type: ServiceType.Midweek,
      includeOptionalRoles: false,
    });

    expect(getWorkerName(preview.rows[0].assignments, WorkerRole.Keyboard)).toBe(
      'Main Keyboard',
    );
  });

  it.each([ServiceType.SumAg, ServiceType.Yanson])(
    'generates %s schedules for every Sunday',
    async (serviceType) => {
      const preview = await service.preview({
        year: 2026,
        month: 8,
        service_type: serviceType,
      });

      expect(preview.rows.map((row) => row.date)).toEqual([
        '2026-08-02',
        '2026-08-09',
        '2026-08-16',
        '2026-08-23',
        '2026-08-30',
      ]);
    },
  );

  it('includes optional Bass and Drums/Beatbox in a non-main preview', async () => {
    const preview = await service.preview({
      year: 2026,
      month: 8,
      service_type: ServiceType.Youth,
    });

    expect(preview.rows[0].assignments.map((assignment) => assignment.role)).toEqual([
      WorkerRole.Leader,
      WorkerRole.Acoustic,
      WorkerRole.Bass,
      WorkerRole.Drums,
    ]);
  });

  it('generates only required non-main roles when optional roles are disabled', async () => {
    const preview = await service.preview({
      year: 2026,
      month: 8,
      service_type: ServiceType.Youth,
      includeOptionalRoles: false,
    });

    expect(preview.rows[0].assignments.map((assignment) => assignment.role)).toEqual([
      WorkerRole.Leader,
      WorkerRole.Acoustic,
    ]);
  });

  it('skips Sundays with an existing Main service schedule', async () => {
    repository.findSchedulesInDateRange.mockImplementation(
      async (_start, _end, serviceType?: ServiceType) => {
        if (serviceType) {
          return [];
        }

        return [
          {
            date: new Date(Date.UTC(2026, 6, 12)),
            service_type: ServiceType.Main,
            assignments: [],
          },
        ];
      },
    );

    const preview = await service.preview({ year: 2026, month: 7 });
    const skippedRow = preview.rows.find((row) => row.date === '2026-07-12');

    expect(skippedRow?.status).toBe('skipped');
    expect(skippedRow?.warnings[0]).toContain('already exists');
  });

  it('uses main-labeled workers for Main required roles and youth only as backup fallback', async () => {
    const preview = await service.preview({ year: 2026, month: 7 });
    const firstSunday = preview.rows[0];

    expect(firstSunday.status).toBe('generated');
    expect(getWorkerName(firstSunday.assignments, WorkerRole.Leader)).toBe(
      'Main Leader',
    );
    expect(getWorkerName(firstSunday.assignments, WorkerRole.Backup)).toBe(
      'Youth Backup',
    );
  });

  it('avoids workers already assigned to another service on the same date', async () => {
    repository.findSchedulesInDateRange.mockImplementation(
      async (_start, _end, serviceType?: ServiceType) => {
        if (serviceType) {
          return [];
        }

        return [
          {
            date: new Date(Date.UTC(2026, 6, 5)),
            service_type: ServiceType.Youth,
            assignments: [{ worker_id: 'acoustic-main-1' }],
          },
        ];
      },
    );

    const preview = await service.preview({ year: 2026, month: 7 });
    const firstSunday = preview.rows[0];

    expect(getWorkerName(firstSunday.assignments, WorkerRole.Acoustic)).toBe(
      'Main Acoustic 2',
    );
  });

  it('marks rows as needs_attention when a required role cannot be filled', async () => {
    workersService.getWorkers.mockResolvedValue({
      items: workers.filter((item) => item._id !== 'drums-main'),
    });

    const preview = await service.preview({ year: 2026, month: 7 });
    const firstSunday = preview.rows[0];

    expect(firstSunday.status).toBe('needs_attention');
    expect(firstSunday.warnings).toContain('Missing required role: Drums');
  });

  function worker(
    id: string,
    name: string,
    roles: WorkerRole[],
    label: WorkerLabel,
    status = WorkerStatus.Active,
  ) {
    return {
      _id: id,
      name,
      roles,
      label,
      status,
    };
  }

  function getWorkerName(assignments, role: WorkerRole) {
    return assignments.find((assignment) => assignment.role === role)?.worker_name;
  }
});
