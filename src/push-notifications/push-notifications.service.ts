import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { Subscription } from 'rxjs';
import {
  AppEventsService,
  PasswordResetRequestedEvent,
} from 'src/common/events/app-events.service';
import { NotificationType } from 'src/common/enums/notification-type.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { SwapTargetResponse } from 'src/common/enums/swap-target-response.enum';
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
  target_user_id?: Types.ObjectId | string;
  target_worker_name?: string;
  target_response?: SwapTargetResponse;
  target_response_note?: string;
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

interface LineupNotificationRecord {
  _id: Types.ObjectId | string;
  date: Date | string;
  service_type: string;
  assignments?: Array<{ worker_id: Types.ObjectId | string }>;
}

interface ScheduleModificationRecord extends LineupNotificationRecord {
  status?: string;
  notes?: string;
  lineup?: string;
  songs?: Array<{
    song_id?: Types.ObjectId | string;
    title?: string;
    artist?: string;
    key?: string;
  }>;
  assignments?: Array<{
    slot_key?: string;
    worker_id: Types.ObjectId | string;
    role: string;
  }>;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationsService.name);
  private passwordResetRequestedSubscription?: Subscription;

  constructor(
    private readonly repository: PushSubscriptionsRepository,
    private readonly webPushClient: WebPushClient,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly workersService: WorkersService,
    private readonly usersService: UsersService,
    private readonly inboxRepository: NotificationInboxRepository,
    private readonly appEvents: AppEventsService,
  ) {}

  onModuleInit() {
    this.passwordResetRequestedSubscription =
      this.appEvents.passwordResetRequested$.subscribe((request) => {
        void this.notifyPasswordResetRequested(request).catch((error) => {
          this.logger.error(
            `Could not notify super admins of password reset request ${request._id}`,
            error instanceof Error ? error.stack : undefined,
          );
        });
      });
  }

  onModuleDestroy() {
    this.passwordResetRequestedSubscription?.unsubscribe();
  }

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

  async previewScheduleReminder(weekStartValue: string) {
    const weekStart = this.parseWeekStart(weekStartValue);
    const recipients = await this.getWeeklyReminderRecipients(weekStart);

    return {
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: new Date(weekStart.getTime() + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      recipients: recipients.map((item) => ({
        user_id: item.userId,
        worker_id: item.workerId,
        worker_name: item.workerName,
        schedules: item.summaries.map((summary) => ({
          schedule_id: summary.id,
          date: summary.date.toISOString(),
          service_type: summary.serviceType,
          roles: [...summary.roles],
        })),
      })),
    };
  }

  async sendManualScheduleReminder(
    weekStartValue: string,
    selectedUserIds: string[],
    triggeredBy: string,
  ) {
    const weekStart = this.parseWeekStart(weekStartValue);
    const recipients = await this.getWeeklyReminderRecipients(weekStart);
    const byUserId = new Map(recipients.map((item) => [item.userId, item]));
    const requested = [...new Set(selectedUserIds)];
    const dispatchId = new Types.ObjectId().toString();
    const result = {
      dispatch_id: dispatchId,
      requested: requested.length,
      notified_users: 0,
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: [] as Array<{ user_id: string; reason: string }>,
    };

    for (const userId of requested) {
      const recipient = byUserId.get(userId);
      if (!recipient) {
        result.skipped.push({
          user_id: userId,
          reason: 'No eligible linked assignment exists for this week',
        });
        continue;
      }

      const basePayload = this.buildPayload(recipient.summaries, weekStart);
      const payload: PushPayload = {
        ...basePayload,
        tag: `manual-schedule-${dispatchId}-${userId}`,
        data: {
          ...basePayload.data,
          notificationType: NotificationType.ScheduleReminder,
        },
      };
      const delivery = await this.storeAndSend(
        [userId],
        NotificationType.ScheduleReminder,
        payload,
        {
          dispatchId,
          triggeredBy,
          weekStart: weekStart.toISOString(),
          serviceCount: recipient.summaries.length,
          manual: true,
        },
      );
      result.notified_users += 1;
      result.sent += delivery.sent;
      result.failed += delivery.failed;
      result.expired += delivery.expired;
    }

    return result;
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

  async notifyPasswordResetRequested(request: PasswordResetRequestedEvent) {
    const superAdmins = await this.usersService.findActiveByRoles([
      UserRole.SuperAdmin,
    ]);
    const recipientIds = superAdmins.map((admin) => admin._id.toString());
    const userId = request._id.toString();
    const requestedAt = new Date(request.password_reset_requested_at);
    const payload: PushPayload = {
      title: 'Password reset requested',
      body: `${request.username || 'A user'} requested a password reset.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `password-reset-requested-${userId}-${requestedAt.getTime()}`,
      data: {
        url: '/requests',
        requestId: userId,
        notificationType: NotificationType.PasswordResetRequested,
      },
    };

    return await this.storeAndSend(
      recipientIds,
      NotificationType.PasswordResetRequested,
      payload,
      { userId, requestedAt: requestedAt.toISOString() },
    );
  }

  async notifySwapTargetRequested(request: WorkerRequestNotificationRecord) {
    if (!request.target_user_id) {
      return { sent: 0, failed: 0, expired: 0 };
    }

    const requestId = request._id.toString();
    const payload: PushPayload = {
      title: 'Swap response needed',
      body: `${request.requester_worker_name} selected you for a schedule swap.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `swap-action-required-${requestId}`,
      data: {
        url: `/requests?requestId=${requestId}`,
        requestId,
        notificationType: NotificationType.SwapActionRequired,
      },
    };

    return await this.storeAndSend(
      [request.target_user_id.toString()],
      NotificationType.SwapActionRequired,
      payload,
      { requestId },
    );
  }

  async notifySwapTargetResponded(request: WorkerRequestNotificationRecord) {
    const accepted = request.target_response === SwapTargetResponse.Accepted;
    const requestId = request._id.toString();
    const notificationType = accepted
      ? NotificationType.SwapAccepted
      : NotificationType.SwapDeclined;
    const payload: PushPayload = {
      title: accepted ? 'Swap accepted by worker' : 'Swap declined by worker',
      body: `${request.target_worker_name ?? 'The selected worker'} ${
        accepted ? 'accepted' : 'declined'
      } the swap with ${request.requester_worker_name}.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `swap-target-${request.target_response}-${requestId}`,
      data: {
        url: `/requests?requestId=${requestId}`,
        requestId,
        notificationType,
      },
    };
    const recipientIds = [request.requester_user_id.toString()];

    if (accepted) {
      const admins = await this.usersService.findActiveByRoles([
        UserRole.Admin,
        UserRole.SuperAdmin,
      ]);
      recipientIds.push(...admins.map((admin) => admin._id.toString()));
    }

    return await this.storeAndSend(
      [...new Set(recipientIds)],
      notificationType,
      payload,
      { requestId },
    );
  }

  async notifyLineupPublished(
    schedule: LineupNotificationRecord,
    isUpdate: boolean,
  ) {
    const workerIds = [...new Set(
      (schedule.assignments ?? []).map((item) => item.worker_id.toString()),
    )];
    const workers = await this.workersService.findWorkersByIds(workerIds);
    const recipientIds: string[] = [];
    for (const worker of workers as any[]) {
      if (!worker.user_id) continue;
      const user = await this.usersService.findById(worker.user_id.toString());
      if (user?.is_active && user.is_verified !== false) {
        recipientIds.push(user._id.toString());
      }
    }
    const admins = await this.usersService.findActiveByRoles([
      UserRole.Admin,
      UserRole.SuperAdmin,
    ]);
    recipientIds.push(...admins.map((admin) => admin._id.toString()));

    const scheduleId = schedule._id.toString();
    const dateKey = new Date(schedule.date).toISOString().slice(0, 10);
    const type = isUpdate
      ? NotificationType.LineupUpdated
      : NotificationType.LineupPosted;
    const formattedDate = new Intl.DateTimeFormat('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(schedule.date));
    const payload: PushPayload = {
      title: isUpdate ? 'Schedule lineup updated' : 'Schedule lineup posted',
      body: `The ${this.formatServiceType(schedule.service_type)} lineup for ${formattedDate} is ready.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: `lineup-${isUpdate ? 'updated' : 'posted'}-${scheduleId}-${Date.now()}`,
      data: {
        url: `/calendar?date=${dateKey}&scheduleId=${scheduleId}`,
        notificationType: type,
      },
    };
    return await this.storeAndSend(
      [...new Set(recipientIds)],
      type,
      payload,
      { scheduleId, date: dateKey, serviceType: schedule.service_type },
    );
  }

  async notifyScheduleModified(
    previous: ScheduleModificationRecord,
    current: ScheduleModificationRecord,
  ) {
    if (
      this.getScheduleNotificationSnapshot(previous) ===
      this.getScheduleNotificationSnapshot(current)
    ) {
      return { notified: 0, sent: 0, failed: 0, expired: 0 };
    }

    const previousRoles = this.getRolesByWorker(previous.assignments ?? []);
    const currentRoles = this.getRolesByWorker(current.assignments ?? []);
    const workerIds = [...new Set([
      ...previousRoles.keys(),
      ...currentRoles.keys(),
    ])];
    const recipients = await this.getActiveLinkedUsers(workerIds);
    const scheduleId = current._id.toString();
    const date = new Date(current.date);
    const dateKey = date.toISOString().slice(0, 10);
    const formattedDate = new Intl.DateTimeFormat('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(date);
    const formattedPreviousDate = new Intl.DateTimeFormat('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(previous.date));
    const serviceName = this.formatServiceType(current.service_type);
    const previousServiceName = this.formatServiceType(previous.service_type);
    const result = { notified: recipients.length, sent: 0, failed: 0, expired: 0 };
    const eventId = new Types.ObjectId().toString();

    for (const recipient of recipients) {
      const before = previousRoles.get(recipient.workerId) ?? [];
      const after = currentRoles.get(recipient.workerId) ?? [];
      const changeType = !before.length
        ? 'assigned'
        : !after.length
          ? 'removed'
          : this.haveSameRoles(before, after)
            ? 'schedule_updated'
            : 'assignment_updated';
      const payload: PushPayload = {
        title: changeType === 'assigned'
          ? 'Added to schedule'
          : changeType === 'removed'
            ? 'Schedule assignment removed'
            : 'Schedule updated',
        body: this.getScheduleModificationBody(
          changeType,
          after,
          changeType === 'removed' ? previousServiceName : serviceName,
          changeType === 'removed' ? formattedPreviousDate : formattedDate,
        ),
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: `schedule-updated-${scheduleId}-${eventId}-${recipient.userId}`,
        data: {
          url: `/calendar?date=${dateKey}&scheduleId=${scheduleId}`,
          notificationType: NotificationType.ScheduleUpdated,
        },
      };
      const delivery = await this.storeAndSend(
        [recipient.userId],
        NotificationType.ScheduleUpdated,
        payload,
        {
          scheduleId,
          date: dateKey,
          serviceType: current.service_type,
          workerId: recipient.workerId,
          changeType,
        },
      );
      result.sent += delivery.sent;
      result.failed += delivery.failed;
      result.expired += delivery.expired;
    }

    return result;
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
    const userIds = [request.requester_user_id.toString()];
    if (request.target_user_id) userIds.push(request.target_user_id.toString());
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

    return await this.storeAndSend(
      [...new Set(userIds)],
      notificationType,
      payload,
      { requestId },
    );
  }

  async storeAndSend(
    userIds: string[],
    type: NotificationType,
    payload: PushPayload,
    metadata?: Record<string, unknown>,
  ) {
    const uniqueUserIds = [...new Set(userIds)];
    await this.inboxRepository.upsertMany(
      uniqueUserIds.map((userId) => ({
        userId,
        type,
        title: payload.title,
        body: payload.body,
        url: payload.data.url,
        dedupeKey: payload.tag,
        metadata,
      })),
    );

    if (!this.webPushClient.isConfigured()) {
      this.logger.warn(`Stored ${type} inbox notifications; Web Push is not configured`);
      return { sent: 0, failed: 0, expired: 0 };
    }

    return await this.sendToUsers(uniqueUserIds, payload);
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

  private async getActiveLinkedUsers(workerIds: string[]) {
    const workers = await this.workersService.findWorkersByIds(workerIds);
    const recipients: Array<{ workerId: string; userId: string }> = [];

    for (const worker of workers as unknown as LinkedWorkerRecord[]) {
      if (!worker.user_id) continue;
      const user = await this.usersService.findById(worker.user_id.toString());
      if (user?.is_active && user.is_verified !== false) {
        recipients.push({
          workerId: worker._id.toString(),
          userId: user._id.toString(),
        });
      }
    }

    return recipients;
  }

  private getRolesByWorker(
    assignments: Array<{
      worker_id: Types.ObjectId | string;
      role: string;
    }>,
  ) {
    const roles = new Map<string, string[]>();
    for (const assignment of assignments) {
      const workerId = assignment.worker_id.toString();
      const workerRoles = roles.get(workerId) ?? [];
      workerRoles.push(assignment.role);
      roles.set(workerId, workerRoles);
    }
    return roles;
  }

  private haveSameRoles(first: string[], second: string[]) {
    return [...first].sort().join('|') === [...second].sort().join('|');
  }

  private getScheduleModificationBody(
    changeType: string,
    roles: string[],
    serviceName: string,
    formattedDate: string,
  ) {
    if (changeType === 'assigned') {
      return `You were assigned as ${roles.join(', ')} for ${serviceName} on ${formattedDate}.`;
    }
    if (changeType === 'removed') {
      return `You are no longer assigned to ${serviceName} on ${formattedDate}.`;
    }
    if (changeType === 'assignment_updated') {
      return `Your ${serviceName} assignment for ${formattedDate} was updated to ${roles.join(', ')}.`;
    }
    return `The ${serviceName} schedule for ${formattedDate} was updated. Please review the latest details.`;
  }

  private getScheduleNotificationSnapshot(schedule: ScheduleModificationRecord) {
    const assignments = (schedule.assignments ?? [])
      .map((assignment) => ({
        slot_key: assignment.slot_key ?? '',
        role: assignment.role,
        worker_id: assignment.worker_id.toString(),
      }))
      .sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));
    const songs = (schedule.songs ?? []).map((song) => ({
      song_id: song.song_id?.toString() ?? '',
      title: song.title ?? '',
      artist: song.artist ?? '',
      key: song.key ?? '',
    }));
    return JSON.stringify({
      date: new Date(schedule.date).toISOString(),
      service_type: schedule.service_type,
      status: schedule.status ?? '',
      notes: schedule.notes ?? '',
      lineup: schedule.lineup ?? '',
      assignments,
      songs,
    });
  }

  private async getWeeklyReminderRecipients(weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const schedules = await this.schedulesService.getActiveSchedulesInDateRange(
      weekStart,
      weekEnd,
    );
    const summariesByWorker = this.groupSchedulesByWorker(
      schedules as unknown as WeeklyScheduleRecord[],
    );
    const workers = await this.workersService.findWorkersByIds([
      ...summariesByWorker.keys(),
    ]);
    const recipients: Array<{
      userId: string;
      workerId: string;
      workerName: string;
      summaries: WeeklyServiceSummary[];
    }> = [];

    for (const worker of workers as any[]) {
      if (!worker.user_id) continue;
      const user = await this.usersService.findById(worker.user_id.toString());
      if (!user?.is_active || user.is_verified === false) continue;
      const summaries = [
        ...(summariesByWorker.get(worker._id.toString())?.values() ?? []),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!summaries.length) continue;
      recipients.push({
        userId: user._id.toString(),
        workerId: worker._id.toString(),
        workerName: worker.name,
        summaries,
      });
    }

    return recipients.sort((a, b) => a.workerName.localeCompare(b.workerName));
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

  private parseWeekStart(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new BadRequestException('week_start must be YYYY-MM-DD');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.getUTCDay() !== 1) {
      throw new BadRequestException('week_start must be a valid Monday');
    }
    return date;
  }
}
