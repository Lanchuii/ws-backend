import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { WorkerGroupsModule } from 'src/worker-groups/worker-groups.module';
import { ServiceTypesRepository } from './repositories/service-types.repository';
import {
  ServiceType,
  ServiceTypeSchema,
} from './schemas/service-types.schema';
import { ServiceTypesController } from './service-types.controller';
import { ServiceTypesService } from './service-types.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceType.name, schema: ServiceTypeSchema },
    ]),
    AuthModule,
    WorkerGroupsModule,
  ],
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService, ServiceTypesRepository],
  exports: [ServiceTypesService],
})
export class ServiceTypesModule {}
