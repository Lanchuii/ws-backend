import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ServiceType } from 'src/common/enums/service-type.enum';
import { ScheduleAssignmentDto } from './schedule-assignment.dto';
import { ScheduleSongDto } from './schedule-song.dto';

export class AutoGenerationConfirmScheduleDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(ServiceType)
  service_type?: ServiceType;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ScheduleAssignmentDto)
  assignments: ScheduleAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSongDto)
  songs?: ScheduleSongDto[];

  @IsOptional()
  @IsString()
  lineup?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AutoGenerationConfirmDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AutoGenerationConfirmScheduleDto)
  schedules: AutoGenerationConfirmScheduleDto[];
}
