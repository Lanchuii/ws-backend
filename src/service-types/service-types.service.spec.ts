import { BadRequestException, ConflictException } from '@nestjs/common';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { RecurrenceType, WorkerEligibilityMode } from './service-type.constants';
import { ServiceTypesService } from './service-types.service';

describe('ServiceTypesService', () => {
  const repository = {
    getRecord: jest.fn(),
    getRecordById: jest.fn(),
    insertRecord: jest.fn(),
    updateRecord: jest.fn(),
    findAll: jest.fn(),
    createIfMissing: jest.fn(),
  };
  const workerGroupsService = {
    ensureDefaults: jest.fn(),
    getByCodes: jest.fn(),
    assertIdsExist: jest.fn(),
  };
  let service: ServiceTypesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceTypesService(
      repository as any,
      workerGroupsService as any,
    );
  });

  it('creates a customizable weekly service type', async () => {
    repository.getRecord.mockResolvedValue(null);
    repository.insertRecord.mockImplementation(async (value) => value);

    const result = await service.createServiceType({
      code: 'Prayer Night',
      name: 'Prayer Night',
      recurrence: { type: RecurrenceType.Weekly, weekday: 5 },
      worker_eligibility: {
        mode: WorkerEligibilityMode.Any,
        allowed_group_ids: [],
        preferred_group_ids: [],
      },
      assignment_slots: [
        {
          key: 'leader',
          label: 'Leader',
          allowed_roles: [WorkerRole.Leader],
          required: true,
          display_order: 10,
        },
      ],
    });

    expect(result.code).toBe('prayer-night');
    expect(repository.insertRecord).toHaveBeenCalled();
  });

  it('rejects group eligibility without an allowed group', async () => {
    repository.getRecord.mockResolvedValue(null);

    await expect(
      service.createServiceType({
        code: 'custom',
        name: 'Custom',
        recurrence: { type: RecurrenceType.Once },
        worker_eligibility: {
          mode: WorkerEligibilityMode.Groups,
          allowed_group_ids: [],
          preferred_group_ids: [],
        },
        assignment_slots: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate assignment slot keys', async () => {
    repository.getRecord.mockResolvedValue(null);
    const assignment = {
      key: 'leader',
      label: 'Leader',
      allowed_roles: [WorkerRole.Leader],
      required: true,
      display_order: 10,
    };

    await expect(
      service.createServiceType({
        code: 'custom',
        name: 'Custom',
        recurrence: { type: RecurrenceType.Once },
        worker_eligibility: {
          mode: WorkerEligibilityMode.Any,
          allowed_group_ids: [],
          preferred_group_ids: [],
        },
        assignment_slots: [assignment, { ...assignment, label: 'Second leader' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate service type codes', async () => {
    repository.getRecord.mockResolvedValue({ _id: 'existing' });

    await expect(
      service.createServiceType({
        code: 'main',
        name: 'Main',
        recurrence: { type: RecurrenceType.Once },
        worker_eligibility: {
          mode: WorkerEligibilityMode.Any,
          allowed_group_ids: [],
          preferred_group_ids: [],
        },
        assignment_slots: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
