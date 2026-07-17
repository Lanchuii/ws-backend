import { IsString, MaxLength } from 'class-validator';

export class UpdateScheduleLineupDto {
  @IsString()
  @MaxLength(2048)
  lineup: string;
}
