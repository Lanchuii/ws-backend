import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersService } from './workers.service';

@Controller('workers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  async getWorkers(@Query('status') status?: WorkerStatus) {
    return await this.workersService.getWorkers(status);
  }

  @Get(':id')
  async getWorkerById(@Param('id') id: string) {
    return await this.workersService.getWorkerById(id);
  }

  @Post()
  @Roles(UserRole.Admin)
  async createWorker(@Body() dto: CreateWorkerDto) {
    return await this.workersService.createWorker(dto);
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  async updateWorker(@Param('id') id: string, @Body() dto: UpdateWorkerDto) {
    return await this.workersService.updateWorker(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  async deleteWorker(@Param('id') id: string) {
    return await this.workersService.deleteWorker(id);
  }
}
