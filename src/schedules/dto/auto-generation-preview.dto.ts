import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @IsBoolean()
  includeOptionalRoles?: boolean;

  @IsOptional()
  @IsBoolean()
  allowYouthBackupFallback?: boolean;
}
