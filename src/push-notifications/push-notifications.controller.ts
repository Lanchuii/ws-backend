import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';
import {
  PreviewScheduleReminderDto,
  SendScheduleReminderDto,
} from './dto/schedule-reminder.dto';
import { PushNotificationsService } from './push-notifications.service';

@Controller('push-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  @Get('public-key')
  getPublicKey() {
    return this.service.getPublicKey();
  }

  @Get('inbox')
  async getInbox(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.service.getInbox(
      request.user.sub,
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Patch('inbox/read-all')
  async markAllInboxNotificationsRead(@Req() request: AuthenticatedRequest) {
    return await this.service.markAllInboxNotificationsRead(request.user.sub);
  }

  @Patch('inbox/:id/read')
  async markInboxNotificationRead(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return await this.service.markInboxNotificationRead(request.user.sub, id);
  }

  @Post('subscriptions')
  async subscribe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    return await this.service.subscribe(request.user.sub, dto);
  }

  @Post('schedule-reminders/preview')
  @Roles(UserRole.Admin)
  async previewScheduleReminder(@Body() dto: PreviewScheduleReminderDto) {
    return await this.service.previewScheduleReminder(dto.week_start);
  }

  @Post('schedule-reminders/send')
  @Roles(UserRole.Admin)
  async sendScheduleReminder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendScheduleReminderDto,
  ) {
    return await this.service.sendManualScheduleReminder(
      dto.week_start,
      dto.user_ids,
      request.user.sub,
    );
  }

  @Delete('subscriptions')
  async unsubscribe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    return await this.service.unsubscribe(request.user.sub, dto.endpoint);
  }
}
