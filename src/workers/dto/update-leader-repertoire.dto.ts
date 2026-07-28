import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateLeaderRepertoireDto {
  @IsNotEmpty()
  @IsString()
  key!: string;
}
