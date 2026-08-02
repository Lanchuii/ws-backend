import { IsEnum, IsMongoId, IsString } from 'class-validator';
import { SwapMode } from 'src/common/enums/swap-mode.enum';

export class SwapOptionsQueryDto {
  @IsEnum(SwapMode)
  mode!: SwapMode;

  @IsMongoId()
  source_schedule_id!: string;

  @IsString()
  source_slot_key!: string;
}
