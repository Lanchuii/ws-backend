import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AutoGenerationWorkerPoolDto {
  @IsString()
  service_type: string;

  @IsString()
  slot_key: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  worker_ids: string[];
}

export class AutoGenerationPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsString()
  service_type?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  service_types?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutoGenerationWorkerPoolDto)
  worker_pools?: AutoGenerationWorkerPoolDto[];

  @IsOptional()
  @IsBoolean()
  includeOptionalRoles?: boolean;

  @IsOptional()
  @IsBoolean()
  allowYouthBackupFallback?: boolean;
}
