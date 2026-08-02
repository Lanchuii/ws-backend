import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { WorkersModule } from 'src/workers/workers.module';
import { WorkerUnavailabilityRepository } from './repositories/worker-unavailability.repository';
import {
  WorkerUnavailability,
  WorkerUnavailabilitySchema,
} from './schemas/worker-unavailability.schema';
import { WorkerUnavailabilityController } from './worker-unavailability.controller';
import { WorkerUnavailabilityService } from './worker-unavailability.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkerUnavailability.name, schema: WorkerUnavailabilitySchema },
    ]),
    AuthModule,
    WorkersModule,
  ],
  controllers: [WorkerUnavailabilityController],
  providers: [WorkerUnavailabilityRepository, WorkerUnavailabilityService],
  exports: [WorkerUnavailabilityService],
})
export class WorkerUnavailabilityModule {}
