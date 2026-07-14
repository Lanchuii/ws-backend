import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ServiceType } from 'src/common/enums/service-type.enum';

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
  @IsEnum(ServiceType)
  service_type?: ServiceType;

  @IsOptional()
  @IsBoolean()
  includeOptionalRoles?: boolean;

  @IsOptional()
  @IsBoolean()
  allowYouthBackupFallback?: boolean;
}
