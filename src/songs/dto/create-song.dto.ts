import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSongDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  spotify_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
