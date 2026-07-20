import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypesService } from './service-types.service';

@Controller('service-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceTypesController {
  constructor(private readonly service: ServiceTypesService) {}

  @Get()
  async getServiceTypes() {
    return await this.service.getServiceTypes();
  }

  @Post()
  @Roles(UserRole.Admin)
  async createServiceType(@Body() dto: CreateServiceTypeDto) {
    return await this.service.createServiceType(dto);
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  async updateServiceType(
    @Param('id') id: string,
    @Body() dto: UpdateServiceTypeDto,
  ) {
    return await this.service.updateServiceType(id, dto);
  }
}
