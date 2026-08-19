import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';
import { CreateUnavailableRequestDto } from './dto/create-unavailable-request.dto';
import { ReviewWorkerRequestDto } from './dto/review-worker-request.dto';
import { RespondSwapRequestDto } from './dto/respond-swap-request.dto';
import { SwapOptionsQueryDto } from './dto/swap-options-query.dto';
import { WorkerRequestsService } from './worker-requests.service';

@Controller('worker-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkerRequestsController {
  constructor(private readonly service: WorkerRequestsService) {}

  @Post('swaps')
  createSwap(@Req() request: AuthenticatedRequest, @Body() dto: CreateSwapRequestDto) {
    return this.service.createSwap(request.user.sub, dto);
  }

  @Get('swap-options')
  getSwapOptions(@Req() request: AuthenticatedRequest, @Query() query: SwapOptionsQueryDto) {
    return this.service.getSwapOptions(request.user.sub, query);
  }

  @Post('unavailability')
  createUnavailable(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUnavailableRequestDto,
  ) {
    return this.service.createUnavailable(request.user.sub, dto);
  }

  @Get('mine')
  getMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.getMine(request.user.sub, query);
  }

  @Get()
  @Roles(UserRole.Admin)
  getAll(@Query() query: Record<string, string | undefined>) {
    return this.service.getAll(query);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.service.cancel(id, request.user.sub);
  }

  @Patch(':id/respond')
  respondToSwap(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: RespondSwapRequestDto,
  ) {
    return this.service.respondToSwap(
      id,
      request.user.sub,
      dto.decision,
      dto.note,
    );
  }

  @Patch(':id/approve')
  @Roles(UserRole.Admin)
  approve(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReviewWorkerRequestDto,
  ) {
    return this.service.approve(id, request.user.sub, dto.note);
  }

  @Patch(':id/reject')
  @Roles(UserRole.Admin)
  reject(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReviewWorkerRequestDto,
  ) {
    return this.service.reject(id, request.user.sub, dto.note);
  }
}
