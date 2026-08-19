import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LineupSongDto {
  @IsOptional()
  @IsMongoId()
  song_id?: string;

  @ValidateIf((item: LineupSongDto) => !item.song_id)
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  artist?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  key?: string;
}

export class UpdateScheduleLineupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineupSongDto)
  songs!: LineupSongDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  spotify_url?: string;
}
