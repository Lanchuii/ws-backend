import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import {
  RecurrenceType,
  WorkerEligibilityMode,
} from '../service-type.constants';

export class ServiceRecurrenceDto {
  @IsEnum(RecurrenceType)
  type!: RecurrenceType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;
}

export class WorkerEligibilityDto {
  @IsEnum(WorkerEligibilityMode)
  mode!: WorkerEligibilityMode;

  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  allowed_group_ids!: string[];

  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  preferred_group_ids!: string[];
}

export class AssignmentSlotDto {
  @IsNotEmpty()
  @IsString()
  key!: string;

  @IsNotEmpty()
  @IsString()
  label!: string;

  @IsArray()
  @ArrayUnique()
  @IsEnum(WorkerRole, { each: true })
  allowed_roles!: WorkerRole[];

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsBoolean()
  allow_multiple?: boolean;

  @IsInt()
  @Min(0)
  display_order!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerEligibilityDto)
  worker_eligibility_override?: WorkerEligibilityDto;
}
