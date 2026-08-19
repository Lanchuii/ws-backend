import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { PushNotificationsModule } from 'src/push-notifications/push-notifications.module';
import { SchedulesModule } from 'src/schedules/schedules.module';
import { WorkerUnavailabilityModule } from 'src/worker-unavailability/worker-unavailability.module';
import { WorkerRequestsRepository } from './repositories/worker-requests.repository';
import { WorkerRequest, WorkerRequestSchema } from './schemas/worker-request.schema';
import { WorkerRequestsController } from './worker-requests.controller';
import { WorkerRequestsService } from './worker-requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkerRequest.name, schema: WorkerRequestSchema },
    ]),
    AuthModule,
    PushNotificationsModule,
    SchedulesModule,
    WorkerUnavailabilityModule,
  ],
  controllers: [WorkerRequestsController],
  providers: [WorkerRequestsRepository, WorkerRequestsService],
})
export class WorkerRequestsModule {}
