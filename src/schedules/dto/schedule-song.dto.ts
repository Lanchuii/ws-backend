import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ScheduleSongDto {
  @IsOptional()
  @IsMongoId()
  song_id?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  key?: string;
}
