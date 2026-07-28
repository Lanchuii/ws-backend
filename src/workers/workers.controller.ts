import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateLeaderSongsDto } from './dto/update-leader-songs.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersService } from './workers.service';
import { AddLeaderRepertoireDto } from './dto/add-leader-repertoire.dto';
import { UpdateLeaderRepertoireDto } from './dto/update-leader-repertoire.dto';

@Controller('workers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  async getWorkers(@Query('status') status?: WorkerStatus) {
    return await this.workersService.getWorkers(status);
  }

  @Patch('me/leader-songs')
  async updateMyLeaderSongs(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateLeaderSongsDto,
  ) {
    return await this.workersService.updateMyLeaderSongs(
      request.user.sub,
      dto.leader_songs,
    );
  }

  @Get('me/repertoire')
  async getMyRepertoire(
    @Req() request: AuthenticatedRequest,
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return await this.workersService.getMyRepertoire(
      request.user.sub,
      search,
      page,
      limit,
    );
  }

  @Post('me/repertoire')
  async addToMyRepertoire(
    @Req() request: AuthenticatedRequest,
    @Body() dto: AddLeaderRepertoireDto,
  ) {
    return await this.workersService.addToMyRepertoire(
      request.user.sub,
      dto,
    );
  }

  @Patch('me/repertoire/:entryId')
  async updateMyRepertoireKey(
    @Req() request: AuthenticatedRequest,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateLeaderRepertoireDto,
  ) {
    return await this.workersService.updateMyRepertoireKey(
      request.user.sub,
      entryId,
      dto.key,
    );
  }

  @Delete('me/repertoire/:entryId')
  async removeFromMyRepertoire(
    @Req() request: AuthenticatedRequest,
    @Param('entryId') entryId: string,
  ) {
    return await this.workersService.removeFromMyRepertoire(
      request.user.sub,
      entryId,
    );
  }

  @Get(':id/repertoire')
  async getWorkerRepertoire(
    @Param('id') id: string,
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return await this.workersService.getWorkerRepertoire(
      id,
      search,
      page,
      limit,
    );
  }

  @Post(':id/repertoire')
  @Roles(UserRole.Admin)
  async addToWorkerRepertoire(
    @Param('id') id: string,
    @Body() dto: AddLeaderRepertoireDto,
  ) {
    return await this.workersService.addToWorkerRepertoire(id, dto);
  }

  @Patch(':id/repertoire/:entryId')
  @Roles(UserRole.Admin)
  async updateWorkerRepertoireKey(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateLeaderRepertoireDto,
  ) {
    return await this.workersService.updateWorkerRepertoireKey(
      id,
      entryId,
      dto.key,
    );
  }

  @Delete(':id/repertoire/:entryId')
  @Roles(UserRole.Admin)
  async removeFromWorkerRepertoire(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    return await this.workersService.removeFromWorkerRepertoire(id, entryId);
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
