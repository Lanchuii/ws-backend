import { IsEnum, IsMongoId } from 'class-validator';
import { WorkerRole } from 'src/common/enums/worker-role.enum';

export class ScheduleAssignmentDto {
  @IsEnum(WorkerRole)
  role: WorkerRole;

  @IsMongoId()
  worker_id: string;
}
