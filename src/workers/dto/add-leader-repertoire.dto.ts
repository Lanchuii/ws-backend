import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddLeaderRepertoireDto {
  @IsOptional()
  @IsMongoId()
  song_id?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  spotify_url?: string;

  @IsNotEmpty()
  @IsString()
  key!: string;
}
