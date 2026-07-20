import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { WorkerRole } from 'src/common/enums/worker-role.enum';

export class ScheduleAssignmentDto {
  @IsOptional()
  @IsString()
  slot_key?: string;

  @IsEnum(WorkerRole)
  role: WorkerRole;

  @IsMongoId()
  worker_id: string;
}
