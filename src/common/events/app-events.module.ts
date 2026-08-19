import { Module } from '@nestjs/common';
import { AppEventsService } from './app-events.service';

@Module({
  providers: [AppEventsService],
  exports: [AppEventsService],
})
export class AppEventsModule {}
