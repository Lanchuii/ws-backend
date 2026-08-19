import { ArrayNotEmpty, IsArray, IsDateString, IsMongoId } from 'class-validator';

export class PreviewScheduleReminderDto {
  @IsDateString()
  week_start!: string;
}

export class SendScheduleReminderDto extends PreviewScheduleReminderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  user_ids!: string[];
}
