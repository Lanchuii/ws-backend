import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerGroupsService } from 'src/worker-groups/worker-groups.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import {
  AssignmentSlotDto,
  ServiceRecurrenceDto,
  WorkerEligibilityDto,
} from './dto/service-type-fields.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypesRepository } from './repositories/service-types.repository';
import {
  RecurrenceType,
  WorkerEligibilityMode,
} from './service-type.constants';

@Injectable()
export class ServiceTypesService implements OnModuleInit {
  constructor(
    private readonly repository: ServiceTypesRepository,
    private readonly workerGroupsService: WorkerGroupsService,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  async getServiceTypes() {
    return await this.repository.findAll();
  }

  async getByCode(code: string, requireActive = false) {
    const serviceType = await this.repository.findByCode(code);

    if (!serviceType || (requireActive && !serviceType.is_active)) {
      throw new NotFoundException('Service type not found or inactive');
    }

    return serviceType;
  }

  async createServiceType(dto: CreateServiceTypeDto) {
    const code = normalizeCode(dto.code);
    const existing = await this.repository.getRecord({ code } as any);

    if (existing) {
      throw new ConflictException('A service type with this code already exists');
    }

    await this.validateConfiguration(
      dto.recurrence,
      dto.worker_eligibility,
      dto.assignment_slots,
      dto.auto_generation_enabled ?? false,
    );

    return await this.repository.insertRecord({
      ...dto,
      code,
      name: dto.name.trim(),
      assignment_slots: normalizeSlots(dto.assignment_slots),
      auto_generation_enabled: dto.auto_generation_enabled ?? false,
      is_active: dto.is_active ?? true,
      display_order: dto.display_order ?? 0,
    } as any);
  }

  async updateServiceType(id: string, dto: UpdateServiceTypeDto) {
    const current = await this.repository.getRecordById(id);

    if (!current) {
      throw new NotFoundException('Service type not found');
    }

    const recurrence = dto.recurrence ?? current.recurrence;
    const eligibility = dto.worker_eligibility ?? current.worker_eligibility;
    const slots = dto.assignment_slots ?? current.assignment_slots;
    const autoGenerationEnabled =
      dto.auto_generation_enabled ?? current.auto_generation_enabled;

    await this.validateConfiguration(
      recurrence as ServiceRecurrenceDto,
      toEligibilityDto(eligibility),
      slots.map(toAssignmentSlotDto),
      autoGenerationEnabled,
    );

    const updated = await this.repository.updateRecord(
      { _id: id } as any,
      {
        ...dto,
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.assignment_slots
          ? { assignment_slots: normalizeSlots(dto.assignment_slots) }
          : {}),
      } as any,
    );

    return updated;
  }

  private async validateConfiguration(
    recurrence: ServiceRecurrenceDto,
    eligibility: WorkerEligibilityDto,
    slots: AssignmentSlotDto[],
    autoGenerationEnabled = false,
  ) {
    if (
      recurrence.type === RecurrenceType.Weekly &&
      recurrence.weekday === undefined
    ) {
      throw new BadRequestException('Weekly services require a weekday');
    }

    if (
      recurrence.type === RecurrenceType.Once &&
      recurrence.weekday !== undefined
    ) {
      throw new BadRequestException('One-time services cannot have a weekday');
    }

    if (
      recurrence.type === RecurrenceType.Once &&
      autoGenerationEnabled
    ) {
      throw new BadRequestException(
        'One-time services cannot use monthly auto-generation',
      );
    }

    const slotKeys = slots.map((slot) => normalizeCode(slot.key));

    if (!slots.length) {
      throw new BadRequestException(
        'A service type requires at least one assignment slot',
      );
    }

    if (new Set(slotKeys).size !== slotKeys.length) {
      throw new BadRequestException('Assignment slot keys must be unique');
    }

    await this.validateEligibility(eligibility);

    for (const slot of slots) {
      if (!slot.allowed_roles.length) {
        throw new BadRequestException(
          `Assignment slot "${slot.label}" requires at least one worker role`,
        );
      }

      if (slot.worker_eligibility_override) {
        await this.validateEligibility(slot.worker_eligibility_override);
      }
    }
  }

  private async validateEligibility(eligibility: WorkerEligibilityDto) {
    if (
      eligibility.mode === WorkerEligibilityMode.Groups &&
      !eligibility.allowed_group_ids.length
    ) {
      throw new BadRequestException(
        'Group-based eligibility requires at least one allowed worker group',
      );
    }

    const allowed = new Set(eligibility.allowed_group_ids);
    const preferredOutsideAllowed = eligibility.preferred_group_ids.some(
      (id) => !allowed.has(id),
    );

    if (preferredOutsideAllowed) {
      throw new BadRequestException(
        'Preferred worker groups must also be allowed',
      );
    }

    await this.workerGroupsService.assertIdsExist([
      ...eligibility.allowed_group_ids,
      ...eligibility.preferred_group_ids,
    ]);
  }

  private async seedDefaults() {
    await this.workerGroupsService.ensureDefaults();
    const groups = await this.workerGroupsService.getByCodes([
      'main',
      'youth',
      'outreach',
    ]);
    const groupId = Object.fromEntries(
      groups.map((group) => [group.code, group._id.toString()]),
    );

    if (!groupId.main || !groupId.youth || !groupId.outreach) {
      return;
    }

    const defaults = buildDefaultServiceTypes(groupId);
    await Promise.all(
      defaults.map((serviceType) =>
        this.repository.createIfMissing(serviceType),
      ),
    );
  }
}

const groupsEligibility = (
  allowed_group_ids: string[],
  preferred_group_ids = allowed_group_ids,
) => ({
  mode: WorkerEligibilityMode.Groups,
  allowed_group_ids,
  preferred_group_ids,
});

const anyEligibility = () => ({
  mode: WorkerEligibilityMode.Any,
  allowed_group_ids: [],
  preferred_group_ids: [],
});

const slot = (
  key: string,
  label: string,
  allowed_roles: WorkerRole[],
  required: boolean,
  display_order: number,
  worker_eligibility_override?: ReturnType<typeof groupsEligibility>,
) => ({
  key,
  label,
  allowed_roles,
  required,
  display_order,
  ...(worker_eligibility_override ? { worker_eligibility_override } : {}),
});

const buildDefaultServiceTypes = (groupId: Record<string, string>) => {
  const nonMainSlots = [
    slot('leader', 'Worship Leader', [WorkerRole.Leader], true, 10),
    slot('acoustic', 'Acoustic', [WorkerRole.Acoustic], true, 20),
    slot('bass', 'Bass', [WorkerRole.Bass], false, 30),
    slot(
      'drums_beatbox',
      'Drums / Beatbox',
      [WorkerRole.Drums, WorkerRole.Beatbox],
      false,
      40,
    ),
  ];

  return [
    {
      code: 'main',
      name: 'Main Service',
      recurrence: { type: RecurrenceType.Weekly, weekday: 0 },
      worker_eligibility: groupsEligibility([groupId.main]),
      assignment_slots: [
        slot('leader', 'Worship Leader', [WorkerRole.Leader], true, 10),
        slot(
          'backup',
          'Back Ups',
          [WorkerRole.Backup],
          false,
          20,
          groupsEligibility(
            [groupId.main, groupId.youth],
            [groupId.main],
          ),
        ),
        slot('acoustic', 'Main Acoustic', [WorkerRole.Acoustic], true, 30),
        slot('electric', 'Electric', [WorkerRole.Electric], false, 40),
        slot('bass', 'Bass', [WorkerRole.Bass], true, 50),
        slot('keyboard', 'Keyboard', [WorkerRole.Keyboard], false, 60),
        slot('drums', 'Drums', [WorkerRole.Drums], true, 70),
      ],
      auto_generation_enabled: true,
      is_active: true,
      display_order: 10,
    },
    {
      code: 'youth',
      name: 'Youth Service',
      recurrence: { type: RecurrenceType.Weekly, weekday: 6 },
      worker_eligibility: groupsEligibility([groupId.youth]),
      assignment_slots: nonMainSlots,
      auto_generation_enabled: true,
      is_active: true,
      display_order: 20,
    },
    {
      code: 'midweek',
      name: 'Midweek Service',
      recurrence: { type: RecurrenceType.Weekly, weekday: 3 },
      worker_eligibility: groupsEligibility([
        groupId.main,
        groupId.youth,
      ]),
      assignment_slots: [
        slot('leader', 'Worship Leader', [WorkerRole.Leader], true, 10),
        slot(
          'acoustic_keys',
          'Acoustic / Keys',
          [WorkerRole.Acoustic, WorkerRole.Keyboard],
          true,
          20,
        ),
        slot('bass', 'Bass', [WorkerRole.Bass], false, 30),
        slot(
          'drums_beatbox',
          'Drums / Beatbox',
          [WorkerRole.Drums, WorkerRole.Beatbox],
          false,
          40,
        ),
      ],
      auto_generation_enabled: true,
      is_active: true,
      display_order: 30,
    },
    ...['sum-ag', 'yanson'].map((code, index) => ({
      code,
      name: code === 'sum-ag' ? 'Sum-ag Service' : 'Yanson Service',
      recurrence: { type: RecurrenceType.Weekly, weekday: 0 },
      worker_eligibility: groupsEligibility([groupId.outreach]),
      assignment_slots: nonMainSlots,
      auto_generation_enabled: true,
      is_active: true,
      display_order: 40 + index * 10,
    })),
    {
      code: 'special',
      name: 'Special Service',
      recurrence: { type: RecurrenceType.Once },
      worker_eligibility: anyEligibility(),
      assignment_slots: nonMainSlots,
      auto_generation_enabled: false,
      is_active: true,
      display_order: 60,
    },
  ];
};

const normalizeCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSlots = (slots: AssignmentSlotDto[]) =>
  slots.map((item) => ({ ...item, key: normalizeCode(item.key) }));

const toEligibilityDto = (value: any): WorkerEligibilityDto => ({
  mode: value.mode,
  allowed_group_ids: (value.allowed_group_ids ?? []).map(String),
  preferred_group_ids: (value.preferred_group_ids ?? []).map(String),
});

const toAssignmentSlotDto = (value: any): AssignmentSlotDto => ({
  key: value.key,
  label: value.label,
  allowed_roles: value.allowed_roles,
  required: value.required,
  display_order: value.display_order,
  ...(value.worker_eligibility_override
    ? {
        worker_eligibility_override: toEligibilityDto(
          value.worker_eligibility_override,
        ),
      }
    : {}),
});
