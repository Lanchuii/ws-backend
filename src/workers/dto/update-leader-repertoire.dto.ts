import { IsString } from 'class-validator';

export class UpdateLeaderRepertoireDto {
  @IsString()
  key!: string;
}
