import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesRepository } from './repositories/schedules.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { Schedule, ScheduleSchema } from './schemas/schedules.schema';
import { AuthModule } from 'src/auth/auth.module';
import { WorkersModule } from 'src/workers/workers.module';
import { ScheduleAutoGenerationService } from './schedule-auto-generation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    AuthModule,
    WorkersModule,
  ],
  providers: [SchedulesService, ScheduleAutoGenerationService, SchedulesRepository],
  controllers: [SchedulesController]
})
export class SchedulesModule {}
