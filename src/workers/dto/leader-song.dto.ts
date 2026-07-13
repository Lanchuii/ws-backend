import { IsNotEmpty, IsString } from 'class-validator';

export class LeaderSongDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  key: string;
}
