import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserVerificationDto } from './dto/update-user-verification.dto';
import { ApprovePasswordResetRequestDto } from './dto/approve-password-reset-request.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SuperAdmin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    return await this.usersService.createUser(dto);
  }

  @Get()
  async getUsers() {
    return await this.usersService.getUsers();
  }

  @Get('linkable')
  @Roles(UserRole.Admin)
  async getLinkableUsers() {
    return await this.usersService.getLinkableUsers();
  }

  @Get('password-reset-requests')
  async getPasswordResetRequests() {
    return await this.usersService.getPasswordResetRequests();
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return await this.usersService.getUserById(id);
  }

  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return await this.usersService.updateUser(id, dto);
  }

  @Patch(':id/role')
  async updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return await this.usersService.updateUserRole(id, dto.role);
  }

  @Patch(':id/verification')
  async updateUserVerification(
    @Param('id') id: string,
    @Body() dto: UpdateUserVerificationDto,
  ) {
    return await this.usersService.updateUserVerification(
      id,
      dto.is_verified,
    );
  }

  @Patch(':id/password-reset-request/approve')
  async approvePasswordResetRequest(
    @Param('id') id: string,
    @Body() dto: ApprovePasswordResetRequestDto,
  ) {
    return await this.usersService.approvePasswordResetRequest(
      id,
      dto.temporary_password,
    );
  }


  @Patch(':id/password-reset-request/reject')
  async rejectPasswordResetRequest(@Param('id') id: string) {
    return await this.usersService.rejectPasswordResetRequest(id);
  }
}
