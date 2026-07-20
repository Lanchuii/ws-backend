import 'dotenv/config';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchedulesModule } from './schedules/schedules.module';
import { WorkersModule } from './workers/workers.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkerGroupsModule } from './worker-groups/worker-groups.module';
import { ServiceTypesModule } from './service-types/service-types.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ws-nest',
    ),
    ScheduleModule.forRoot(),
    AuthModule,
    SchedulesModule,
    WorkersModule,
    WorkerGroupsModule,
    ServiceTypesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
