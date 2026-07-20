import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ScheduleStatus } from 'src/common/enums/schedule-status.enum';
import { ScheduleAssignmentDto } from './schedule-assignment.dto';
import { ScheduleSongDto } from './schedule-song.dto';

export class CreateScheduleDTO {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  service_type?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleAssignmentDto)
  assignments: ScheduleAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSongDto)
  songs?: ScheduleSongDto[];

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsString()
  lineup?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
