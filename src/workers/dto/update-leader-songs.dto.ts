import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { LeaderSongDto } from './leader-song.dto';

export class UpdateLeaderSongsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaderSongDto)
  leader_songs: LeaderSongDto[];
}
