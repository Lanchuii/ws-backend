import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ScheduleSongDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  key?: string;
}
