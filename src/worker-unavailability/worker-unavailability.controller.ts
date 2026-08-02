import { Controller, Delete, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerUnavailabilityService } from './worker-unavailability.service';

@Controller('worker-unavailability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkerUnavailabilityController {
  constructor(private readonly service: WorkerUnavailabilityService) {}

  @Get('mine')
  getMine(
    @Req() request: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.getMine(request.user.sub, page, limit);
  }

  @Get()
  @Roles(UserRole.Admin)
  getAll(@Query() query: Record<string, string | undefined>) {
    return this.service.getAll(query);
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('note') note?: string,
  ) {
    return this.service.remove(id, request.user.sub, note);
  }
}
