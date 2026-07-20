import { IsBoolean } from 'class-validator';

export class UpdateUserVerificationDto {
  @IsBoolean()
  is_verified: boolean;
}
