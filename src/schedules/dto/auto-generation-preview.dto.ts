import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

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
  @IsBoolean()
  includeOptionalRoles?: boolean;

  @IsOptional()
  @IsBoolean()
  allowYouthBackupFallback?: boolean;
}
