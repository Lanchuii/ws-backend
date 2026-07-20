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

export class UpdateServiceTypeDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceRecurrenceDto)
  recurrence?: ServiceRecurrenceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerEligibilityDto)
  worker_eligibility?: WorkerEligibilityDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentSlotDto)
  assignment_slots?: AssignmentSlotDto[];

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
