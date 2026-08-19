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
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushNotificationsService } from './push-notifications.service';

@Controller('push-notifications')
@UseGuards(JwtAuthGuard)
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

  @Delete('subscriptions')
  async unsubscribe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    return await this.service.unsubscribe(request.user.sub, dto.endpoint);
  }
}
