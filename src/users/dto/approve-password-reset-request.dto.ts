import { IsString, MinLength } from 'class-validator';

export class ApprovePasswordResetRequestDto {
  @IsString()
  @MinLength(8)
  temporary_password!: string;
}
