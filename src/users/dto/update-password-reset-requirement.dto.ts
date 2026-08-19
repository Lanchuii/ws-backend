import { IsBoolean } from 'class-validator';

export class UpdatePasswordResetRequirementDto {
  @IsBoolean()
  required!: boolean;
}
