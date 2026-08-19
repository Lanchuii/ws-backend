import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { NotificationType } from 'src/common/enums/notification-type.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { SchedulesService } from 'src/schedules/schedules.service';
import { UsersService } from 'src/users/users.service';
import { WorkersService } from 'src/workers/workers.service';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { NotificationInboxRepository } from './repositories/notification-inbox.repository';
import { PushSubscriptionsRepository } from './repositories/push-subscriptions.repository';
import { WebPushClient } from './web-push.client';

interface WeeklyServiceSummary {
  id: string;
  date: Date;
  serviceType: string;
  roles: Set<string>;
}

interface WeeklyScheduleRecord {
  _id: Types.ObjectId | string;
  date: Date | string;
  service_type: string;
  assignments?: Array<{
    worker_id: Types.ObjectId | string;
    role: string;
  }>;
}

interface LinkedWorkerRecord {
  _id: Types.ObjectId | string;
  user_id?: Types.ObjectId | string;
}

interface PendingSubscriptionRecord {
  _id: Types.ObjectId | string;
  user_id: Types.ObjectId | string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface WorkerRequestNotificationRecord {
  _id: Types.ObjectId | string;
  type: WorkerRequestType;
  status: WorkerRequestStatus;
  requester_user_id: Types.ObjectId | string;
  requester_worker_name: string;
  unavailable_date?: Date | string;
  reviewer_note?: string;
  source_assignment?: {
    schedule_date: Date | string;
    role?: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  data: {
    url: string;
    requestId?: string;
    notificationType?: string;
  };
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    private readonly repository: PushSubscriptionsRepository,
    private readonly webPushClient: WebPushClient,
    private readonly schedulesService: SchedulesService,
    private readonly workersService: WorkersService,
    private readonly usersService: UsersService,
    private readonly inboxRepository: NotificationInboxRepository,
  ) {}

  getPublicKey() {
    const publicKey = this.webPushClient.getPublicKey();

    if (!publicKey) {
      throw new ServiceUnavailableException(
        'Push notifications are not configured',
      );
    }

    return { publicKey };
  }

  async subscribe(userId: string, dto: CreatePushSubscriptionDto) {
    if (!this.webPushClient.isConfigured()) {
      throw new ServiceUnavailableException(
        'Push notifications are not configured',
      );
    }

    const user = await this.usersService.findById(userId);

    if (!user?.is_active || user.is_verified === false) {
      throw new BadRequestException(
        'Only active, verified accounts can enable notifications',
      );
    }

    const isAdmin =
      user.role === UserRole.Admin || user.role === UserRole.SuperAdmin;
    const worker = isAdmin
      ? undefined
      : await this.workersService.findWorkerByUserId(userId);

    if (!isAdmin && !worker) {
      throw new BadRequestException(
        'Only admins or accounts linked to a worker can enable notifications',
      );
    }

    await this.repository.upsertForUser(userId, dto);
    return { enabled: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.repository.deleteForUser(userId, endpoint);
    return { enabled: false };
  }

  async getInbox(userId: string, page = 1, limit = 20) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    return await this.inboxRepository.listForUser(
      userId,
      safePage,
      Math.min(50, safeLimit),
    );
  }

  async markInboxNotificationRead(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Notification not found');
    }

    const notification = await this.inboxRepository.markRead(userId, id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async markAllInboxNotificationsRead(userId: string) {
    return await this.inboxRepository.markAllRead(userId);
  }

  async notifyRequestCreated(request: WorkerRequestNotificationRecord) {
    const admins = await this.usersService.findActiveByRoles([
      UserRole.Admin,
      UserRole.SuperAdmin,
    ]);
    const adminIds = admins.map((admin) => admin._id.toString());
    const requestId = request._id.toString();
    const article = request.type === WorkerRequestType.Unavailable ? 'an' : 'a';
    const payload: PushPayload = {
      title: 'New worker request',
      body: `${request.requester_worker_name} submitted ${article} ${this.formatRequestLabel(request)}.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `worker-request-created-${requestId}`,
      data: {
        url: '/requests',
        requestId,
        notificationType: NotificationType.RequestCreated,
      },
    };

    await this.inboxRepository.upsertMany(
      adminIds.map((userId) => ({
        userId,
        type: NotificationType.RequestCreated,
        title: payload.title,
        body: payload.body,
        url: payload.data.url,
        dedupeKey: payload.tag,
        metadata: { requestId },
      })),
    );

    if (!this.webPushClient.isConfigured()) {
      this.logger.warn(
        'Stored request-created inbox notifications; Web Push is not configured',
      );
      return { sent: 0, failed: 0, expired: 0 };
    }

    return await this.sendToUsers(adminIds, payload);
  }

  async notifyRequestReviewed(request: WorkerRequestNotificationRecord) {
    if (
      request.status !== WorkerRequestStatus.Approved &&
      request.status !== WorkerRequestStatus.Rejected
    ) {
      return { sent: 0, failed: 0, expired: 0 };
    }

    const approved = request.status === WorkerRequestStatus.Approved;
    const requestId = request._id.toString();
    const userId = request.requester_user_id.toString();
    const note = request.reviewer_note?.trim();
    const noteSuffix = note ? ` Admin note: ${note.slice(0, 120)}` : '';
    const notificationType = approved
      ? NotificationType.RequestApproved
      : NotificationType.RequestDenied;
    const payload: PushPayload = {
      title: approved ? 'Request approved' : 'Request denied',
      body: `Your ${this.formatRequestLabel(request)} was ${
        approved ? 'approved' : 'denied'
      }.${noteSuffix}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `worker-request-${request.status}-${requestId}`,
      data: {
        url: '/requests',
        requestId,
        notificationType,
      },
    };

    await this.inboxRepository.upsertMany([
      {
        userId,
        type: notificationType,
        title: payload.title,
        body: payload.body,
        url: payload.data.url,
        dedupeKey: payload.tag,
        metadata: { requestId },
      },
    ]);

    if (!this.webPushClient.isConfigured()) {
      this.logger.warn(
        'Stored request decision inbox notification; Web Push is not configured',
      );
      return { sent: 0, failed: 0, expired: 0 };
    }

    return await this.sendToUsers([userId], payload);
  }

  @Cron(process.env.WEB_PUSH_REMINDER_CRON || '0 8 * * 1', {
    timeZone: process.env.CHURCH_TIMEZONE || 'Asia/Manila',
  })
  async sendWeeklyReminders(now = new Date()) {
    const weekStart = this.getLocalWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const schedules = await this.schedulesService.getActiveSchedulesInDateRange(
      weekStart,
      weekEnd,
    );
    const summariesByWorker = this.groupSchedulesByWorker(
      schedules as unknown as WeeklyScheduleRecord[],
    );
    const workerIds = [...summariesByWorker.keys()];
    const workers = await this.workersService.findWorkersByIds(workerIds);
    const usableWorkers: Array<{
      userId: string;
      summaries: WeeklyServiceSummary[];
    }> = [];

    for (const worker of workers as unknown as LinkedWorkerRecord[]) {
      if (!worker.user_id) continue;

      const userId = worker.user_id.toString();
      const user = await this.usersService.findById(userId);

      if (!user?.is_active || user.is_verified === false) continue;

      usableWorkers.push({
        userId,
        summaries: [
          ...(summariesByWorker.get(worker._id.toString())?.values() ?? []),
        ].sort((a, b) => a.date.getTime() - b.date.getTime()),
      });
    }

    if (!usableWorkers.length) {
      return { sent: 0, failed: 0, expired: 0 };
    }

    const weekKey = weekStart.toISOString().slice(0, 10);
    await this.inboxRepository.upsertMany(
      usableWorkers.map((item) => {
        const payload = this.buildPayload(item.summaries, weekStart);
        return {
          userId: item.userId,
          type: NotificationType.ScheduleReminder,
          title: payload.title,
          body: payload.body,
          url: payload.data.url,
          dedupeKey: `weekly-schedule-${weekKey}`,
          metadata: {
            weekStart: weekStart.toISOString(),
            serviceCount: item.summaries.length,
          },
        };
      }),
    );

    if (!this.webPushClient.isConfigured()) {
      this.logger.warn(
        'Stored weekly schedule inbox notifications; Web Push is not configured',
      );
      return { sent: 0, failed: 0, expired: 0 };
    }

    const subscriptions = await this.repository.findPendingForUsers(
      usableWorkers.map((item) => item.userId),
      weekStart,
    );
    const summariesByUser = new Map(
      usableWorkers.map((item) => [item.userId, item.summaries]),
    );
    const result = { sent: 0, failed: 0, expired: 0 };

    for (const subscription of subscriptions as unknown as PendingSubscriptionRecord[]) {
      const summaries = summariesByUser.get(subscription.user_id.toString());
      if (!summaries?.length) continue;

      try {
        await this.webPushClient.send(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(this.buildPayload(summaries, weekStart)),
          { TTL: 86_400, urgency: 'normal' },
        );
        await this.repository.markWeeklyReminderSent(
          subscription._id.toString(),
          weekStart,
        );
        result.sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await this.repository.deleteById(subscription._id.toString());
          result.expired += 1;
          continue;
        }

        result.failed += 1;
        this.logger.error(
          `Weekly reminder failed for subscription ${subscription._id.toString()}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return result;
  }

  private groupSchedulesByWorker(schedules: WeeklyScheduleRecord[]) {
    const grouped = new Map<string, Map<string, WeeklyServiceSummary>>();

    for (const schedule of schedules) {
      for (const assignment of schedule.assignments ?? []) {
        const workerId = assignment.worker_id.toString();
        const scheduleId = schedule._id.toString();
        const workerSchedules =
          grouped.get(workerId) ?? new Map<string, WeeklyServiceSummary>();
        const summary = workerSchedules.get(scheduleId) ?? {
          id: scheduleId,
          date: new Date(schedule.date),
          serviceType: schedule.service_type,
          roles: new Set<string>(),
        };

        summary.roles.add(assignment.role);
        workerSchedules.set(scheduleId, summary);
        grouped.set(workerId, workerSchedules);
      }
    }

    return grouped;
  }

  private buildPayload(summaries: WeeklyServiceSummary[], weekStart: Date) {
    const visible = summaries.slice(0, 2).map((summary) => {
      const date = new Intl.DateTimeFormat('en-PH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(summary.date);
      const roles = [...summary.roles].join(', ');
      return `${date} — ${this.formatServiceType(summary.serviceType)} (${roles})`;
    });
    const remaining = summaries.length - visible.length;
    const prefix =
      summaries.length === 1 ? '' : `${summaries.length} services: `;
    const body = `${prefix}${visible.join('; ')}${
      remaining > 0 ? `; +${remaining} more` : ''
    }`;

    return {
      title: 'TLLCC Worship: This week’s schedule',
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `weekly-schedule-${weekStart.toISOString().slice(0, 10)}`,
      data: { url: '/#my-serving-dates' },
    };
  }

  private formatServiceType(value: string) {
    return value
      .split(/[-_\s]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private formatRequestLabel(request: WorkerRequestNotificationRecord) {
    const dateValue =
      request.type === WorkerRequestType.Unavailable
        ? request.unavailable_date
        : request.source_assignment?.schedule_date;
    const date = dateValue
      ? new Intl.DateTimeFormat('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(dateValue))
      : undefined;

    if (request.type === WorkerRequestType.Unavailable) {
      return `unavailable-date request${date ? ` for ${date}` : ''}`;
    }

    const role = request.source_assignment?.role;
    return `schedule swap request${date ? ` for ${date}` : ''}${
      role ? ` (${role})` : ''
    }`;
  }

  private async sendToUsers(userIds: string[], payload: PushPayload) {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) {
      return { sent: 0, failed: 0, expired: 0 };
    }

    const subscriptions = await this.repository.findForUsers(uniqueUserIds);
    const result = { sent: 0, failed: 0, expired: 0 };

    for (const subscription of subscriptions as unknown as PendingSubscriptionRecord[]) {
      try {
        await this.webPushClient.send(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
          { TTL: 86_400, urgency: 'high' },
        );
        result.sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await this.repository.deleteById(subscription._id.toString());
          result.expired += 1;
          continue;
        }

        result.failed += 1;
        this.logger.error(
          `Push notification failed for subscription ${subscription._id.toString()}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return result;
  }

  private getLocalWeekStart(now: Date) {
    const offsetMinutes = Number(
      process.env.CHURCH_TIMEZONE_OFFSET_MINUTES || 480,
    );
    const localNow = new Date(now.getTime() + offsetMinutes * 60 * 1000);
    const localDate = new Date(
      Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate(),
      ),
    );
    const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
    localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
    return localDate;
  }
}
