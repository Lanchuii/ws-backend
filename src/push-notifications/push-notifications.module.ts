import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { SchedulesModule } from 'src/schedules/schedules.module';
import { UsersModule } from 'src/users/users.module';
import { AppEventsModule } from 'src/common/events/app-events.module';
import { WorkersModule } from 'src/workers/workers.module';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { NotificationInboxRepository } from './repositories/notification-inbox.repository';
import { PushSubscriptionsRepository } from './repositories/push-subscriptions.repository';
import {
  NotificationInboxRecord,
  NotificationInboxSchema,
} from './schemas/notification-inbox.schema';
import {
  PushSubscriptionRecord,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';
import { WebPushClient } from './web-push.client';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionRecord.name, schema: PushSubscriptionSchema },
      { name: NotificationInboxRecord.name, schema: NotificationInboxSchema },
    ]),
    AuthModule,
    forwardRef(() => SchedulesModule),
    WorkersModule,
    UsersModule,
    AppEventsModule,
  ],
  controllers: [PushNotificationsController],
  providers: [
    PushNotificationsService,
    NotificationInboxRepository,
    PushSubscriptionsRepository,
    WebPushClient,
  ],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
