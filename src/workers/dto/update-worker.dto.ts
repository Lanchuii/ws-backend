import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsMongoId, IsOptional, IsString, ValidateNested } from 'class-validator';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { LeaderSongDto } from './leader-song.dto';

export class UpdateWorkerDto {
  @IsOptional()
  @IsMongoId()
  user_id?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(WorkerRole, { each: true })
  roles?: WorkerRole[];

  @IsOptional()
  @IsEnum(WorkerLabel)
  label?: WorkerLabel;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  worker_group_ids?: string[];

  @IsOptional()
  @IsEnum(WorkerStatus)
  status?: WorkerStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaderSongDto)
  leader_songs?: LeaderSongDto[];
}
