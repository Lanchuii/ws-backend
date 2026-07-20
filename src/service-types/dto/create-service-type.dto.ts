import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AssignmentSlotDto,
  ServiceRecurrenceDto,
  WorkerEligibilityDto,
} from './service-type-fields.dto';

export class CreateServiceTypeDto {
  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => ServiceRecurrenceDto)
  recurrence!: ServiceRecurrenceDto;

  @ValidateNested()
  @Type(() => WorkerEligibilityDto)
  worker_eligibility!: WorkerEligibilityDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentSlotDto)
  assignment_slots!: AssignmentSlotDto[];

  @IsOptional()
  @IsBoolean()
  auto_generation_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}
