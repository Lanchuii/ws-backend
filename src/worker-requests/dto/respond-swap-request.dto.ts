import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum SwapTargetDecision {
  Accept = 'accept',
  Decline = 'decline',
}

export class RespondSwapRequestDto {
  @IsEnum(SwapTargetDecision)
  decision!: SwapTargetDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
