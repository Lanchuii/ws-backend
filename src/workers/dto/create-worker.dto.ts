import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { LeaderSongDto } from './leader-song.dto';

export class CreateWorkerDto {
  @IsOptional()
  @IsMongoId()
  user_id?: string | null;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsArray()
  @IsEnum(WorkerRole, { each: true })
  roles: WorkerRole[];

  @IsOptional()
  @IsEnum(WorkerLabel)
  label?: WorkerLabel;

  @IsOptional()
  @IsEnum(WorkerStatus)
  status?: WorkerStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaderSongDto)
  leader_songs?: LeaderSongDto[];
}
