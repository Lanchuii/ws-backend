import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesRepository } from './repositories/schedules.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { Schedule, ScheduleSchema } from './schemas/schedules.schema';
import { AuthModule } from 'src/auth/auth.module';
import { WorkersModule } from 'src/workers/workers.module';
import { ScheduleAutoGenerationService } from './schedule-auto-generation.service';
import { ServiceTypesModule } from 'src/service-types/service-types.module';
import { WorkerUnavailabilityModule } from 'src/worker-unavailability/worker-unavailability.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    AuthModule,
    WorkersModule,
    ServiceTypesModule,
    WorkerUnavailabilityModule,
  ],
  providers: [SchedulesService, ScheduleAutoGenerationService, SchedulesRepository],
  controllers: [SchedulesController],
  exports: [SchedulesService],
})
export class SchedulesModule {}
