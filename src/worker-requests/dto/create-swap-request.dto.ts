import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SwapMode } from 'src/common/enums/swap-mode.enum';

export class CreateSwapRequestDto {
  @IsEnum(SwapMode)
  mode!: SwapMode;

  @IsMongoId()
  source_schedule_id!: string;

  @IsString()
  source_slot_key!: string;

  @ValidateIf((dto: CreateSwapRequestDto) => dto.mode === SwapMode.Replacement)
  @IsMongoId()
  target_worker_id?: string;

  @ValidateIf((dto: CreateSwapRequestDto) => dto.mode === SwapMode.Exchange)
  @IsMongoId()
  target_schedule_id?: string;

  @ValidateIf((dto: CreateSwapRequestDto) => dto.mode === SwapMode.Exchange)
  @IsString()
  target_slot_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
