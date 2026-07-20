import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateWorkerGroupDto } from './dto/create-worker-group.dto';
import { UpdateWorkerGroupDto } from './dto/update-worker-group.dto';
import { WorkerGroupsService } from './worker-groups.service';

@Controller('worker-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkerGroupsController {
  constructor(private readonly service: WorkerGroupsService) {}

  @Get()
  async getWorkerGroups() {
    return await this.service.getWorkerGroups();
  }

  @Post()
  @Roles(UserRole.Admin)
  async createWorkerGroup(@Body() dto: CreateWorkerGroupDto) {
    return await this.service.createWorkerGroup(dto);
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  async updateWorkerGroup(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerGroupDto,
  ) {
    return await this.service.updateWorkerGroup(id, dto);
  }
}
