import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewWorkerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
