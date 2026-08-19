import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NotificationType } from 'src/common/enums/notification-type.enum';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { SchedulesService } from 'src/schedules/schedules.service';
import { UsersService } from 'src/users/users.service';
import { WorkersService } from 'src/workers/workers.service';
import { PushNotificationsService } from './push-notifications.service';
import { NotificationInboxRepository } from './repositories/notification-inbox.repository';
import { PushSubscriptionsRepository } from './repositories/push-subscriptions.repository';
import { WebPushClient } from './web-push.client';

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  const workerId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const subscriptionId = new Types.ObjectId().toString();
  const repository = {
    upsertForUser: jest.fn(),
    deleteForUser: jest.fn(),
    findForUsers: jest.fn(),
    findPendingForUsers: jest.fn(),
    markWeeklyReminderSent: jest.fn(),
    deleteById: jest.fn(),
  };
  const webPushClient = {
    isConfigured: jest.fn(),
    getPublicKey: jest.fn(),
    send: jest.fn(),
  };
  const schedulesService = {
    getActiveSchedulesInDateRange: jest.fn(),
  };
  const workersService = {
    findWorkerByUserId: jest.fn(),
    findWorkersByIds: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
    findActiveByRoles: jest.fn(),
  };
  const inboxRepository = {
    upsertMany: jest.fn(),
    listForUser: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        { provide: PushSubscriptionsRepository, useValue: repository },
        { provide: WebPushClient, useValue: webPushClient },
        { provide: SchedulesService, useValue: schedulesService },
        { provide: WorkersService, useValue: workersService },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationInboxRepository, useValue: inboxRepository },
      ],
    }).compile();

    service = module.get(PushNotificationsService);
    jest.clearAllMocks();
    webPushClient.isConfigured.mockReturnValue(true);
    webPushClient.getPublicKey.mockReturnValue('public-key');
    webPushClient.send.mockResolvedValue({ statusCode: 201 });
    repository.findPendingForUsers.mockResolvedValue([]);
    repository.findForUsers.mockResolvedValue([]);
    repository.markWeeklyReminderSent.mockResolvedValue({ modifiedCount: 1 });
    repository.deleteById.mockResolvedValue({ deletedCount: 1 });
    workersService.findWorkersByIds.mockResolvedValue([]);
    usersService.findById.mockResolvedValue({
      _id: userId,
      role: UserRole.Member,
      is_active: true,
      is_verified: true,
    });
    usersService.findActiveByRoles.mockResolvedValue([]);
    inboxRepository.upsertMany.mockResolvedValue({ upsertedCount: 0 });
    inboxRepository.listForUser.mockResolvedValue({
      items: [],
      unread_count: 0,
      pagination: { page: 0, per_page: 20, last_page: 0, total_rows: 0 },
    });
    inboxRepository.markAllRead.mockResolvedValue({ updated: 0 });
  });

  it('returns the configured VAPID public key', () => {
    expect(service.getPublicKey()).toEqual({ publicKey: 'public-key' });
  });

  it('lists and updates only the authenticated user inbox', async () => {
    const notificationId = new Types.ObjectId().toString();
    inboxRepository.markRead.mockResolvedValue({
      _id: notificationId,
      user_id: userId,
      read_at: new Date(),
    });

    await service.getInbox(userId, 0, 100);
    expect(inboxRepository.listForUser).toHaveBeenCalledWith(userId, 1, 50);

    await service.markInboxNotificationRead(userId, notificationId);
    expect(inboxRepository.markRead).toHaveBeenCalledWith(
      userId,
      notificationId,
    );

    await service.markAllInboxNotificationsRead(userId);
    expect(inboxRepository.markAllRead).toHaveBeenCalledWith(userId);

    inboxRepository.markRead.mockResolvedValue(null);
    await expect(
      service.markInboxNotificationRead(userId, notificationId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects setup when VAPID is unavailable', async () => {
    webPushClient.isConfigured.mockReturnValue(false);
    webPushClient.getPublicKey.mockReturnValue(undefined);

    expect(() => service.getPublicKey()).toThrow(ServiceUnavailableException);
    await expect(
      service.subscribe(userId, subscriptionDto()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('allows linked workers and admins to subscribe', async () => {
    workersService.findWorkerByUserId.mockResolvedValue(null);

    await expect(
      service.subscribe(userId, subscriptionDto()),
    ).rejects.toBeInstanceOf(BadRequestException);

    workersService.findWorkerByUserId.mockResolvedValue({ _id: workerId });
    repository.upsertForUser.mockResolvedValue({ _id: subscriptionId });

    await expect(service.subscribe(userId, subscriptionDto())).resolves.toEqual(
      {
        enabled: true,
      },
    );
    expect(repository.upsertForUser).toHaveBeenCalledWith(
      userId,
      subscriptionDto(),
    );

    usersService.findById.mockResolvedValue({
      _id: userId,
      role: UserRole.Admin,
      is_active: true,
      is_verified: true,
    });
    workersService.findWorkerByUserId.mockClear();

    await expect(service.subscribe(userId, subscriptionDto())).resolves.toEqual(
      { enabled: true },
    );
    expect(workersService.findWorkerByUserId).not.toHaveBeenCalled();
  });

  it('notifies active admins when a worker creates a request', async () => {
    const adminId = new Types.ObjectId().toString();
    usersService.findActiveByRoles.mockResolvedValue([
      { _id: adminId, role: UserRole.Admin },
    ]);
    repository.findForUsers.mockResolvedValue([
      {
        _id: subscriptionId,
        user_id: adminId,
        endpoint: 'https://push.example/admin',
        p256dh: 'admin-key',
        auth: 'admin-auth',
      },
    ]);

    const result = await service.notifyRequestCreated({
      _id: new Types.ObjectId(),
      type: WorkerRequestType.Unavailable,
      status: WorkerRequestStatus.Pending,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_name: 'Joshua',
      unavailable_date: new Date('2026-09-06T00:00:00.000Z'),
    });

    expect(usersService.findActiveByRoles).toHaveBeenCalledWith([
      UserRole.Admin,
      UserRole.SuperAdmin,
    ]);
    expect(repository.findForUsers).toHaveBeenCalledWith([adminId]);
    expect(inboxRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: adminId,
        type: NotificationType.RequestCreated,
      }),
    ]);
    const sendMock = webPushClient.send as jest.MockedFunction<
      (
        subscription: unknown,
        payload: string,
        options: unknown,
      ) => Promise<unknown>
    >;
    const payload = JSON.parse(sendMock.mock.calls[0][1]) as {
      title: string;
      body: string;
      data: { url: string; notificationType: string };
    };
    expect(payload.title).toBe('New worker request');
    expect(payload.body).toContain(
      'Joshua submitted an unavailable-date request',
    );
    expect(payload.data).toMatchObject({
      url: '/requests',
      notificationType: 'request_created',
    });
    expect(result).toEqual({ sent: 1, failed: 0, expired: 0 });
  });

  it('notifies the requesting worker when an admin approves or denies a request', async () => {
    repository.findForUsers.mockResolvedValue([
      {
        _id: subscriptionId,
        user_id: userId,
        endpoint: 'https://push.example/worker',
        p256dh: 'worker-key',
        auth: 'worker-auth',
      },
    ]);

    const result = await service.notifyRequestReviewed({
      _id: new Types.ObjectId(),
      type: WorkerRequestType.Swap,
      status: WorkerRequestStatus.Rejected,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_name: 'Joshua',
      reviewer_note: 'The replacement is unavailable.',
      source_assignment: {
        schedule_date: new Date('2026-09-06T00:00:00.000Z'),
        role: 'Leader',
      },
    });

    expect(repository.findForUsers).toHaveBeenCalledWith([userId]);
    expect(inboxRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId,
        type: NotificationType.RequestDenied,
      }),
    ]);
    const sendMock = webPushClient.send as jest.MockedFunction<
      (
        subscription: unknown,
        payload: string,
        options: unknown,
      ) => Promise<unknown>
    >;
    const payload = JSON.parse(sendMock.mock.calls[0][1]) as {
      title: string;
      body: string;
      data: { notificationType: string };
    };
    expect(payload.title).toBe('Request denied');
    expect(payload.body).toContain('schedule swap request');
    expect(payload.body).toContain(
      'Admin note: The replacement is unavailable.',
    );
    expect(payload.data.notificationType).toBe('request_denied');
    expect(result).toEqual({ sent: 1, failed: 0, expired: 0 });
  });

  it('deletes only the authenticated user subscription', async () => {
    repository.deleteForUser.mockResolvedValue({ deletedCount: 1 });

    await expect(
      service.unsubscribe(userId, 'https://push.example/subscription'),
    ).resolves.toEqual({ enabled: false });
    expect(repository.deleteForUser).toHaveBeenCalledWith(
      userId,
      'https://push.example/subscription',
    );
  });

  it('groups the Monday-through-Sunday services into one device summary', async () => {
    const firstScheduleId = new Types.ObjectId().toString();
    const secondScheduleId = new Types.ObjectId().toString();
    schedulesService.getActiveSchedulesInDateRange.mockResolvedValue([
      {
        _id: firstScheduleId,
        date: new Date('2026-08-19T00:00:00.000Z'),
        service_type: 'midweek',
        assignments: [
          { worker_id: workerId, role: 'Leader' },
          { worker_id: workerId, role: 'Acoustic' },
        ],
      },
      {
        _id: secondScheduleId,
        date: new Date('2026-08-23T00:00:00.000Z'),
        service_type: 'main',
        assignments: [{ worker_id: workerId, role: 'Acoustic' }],
      },
    ]);
    workersService.findWorkersByIds.mockResolvedValue([
      { _id: workerId, user_id: userId },
    ]);
    repository.findPendingForUsers.mockResolvedValue([
      {
        _id: subscriptionId,
        user_id: userId,
        endpoint: 'https://push.example/subscription',
        p256dh: 'p256dh',
        auth: 'auth',
      },
    ]);

    const result = await service.sendWeeklyReminders(
      new Date('2026-08-17T00:00:00.000Z'),
    );

    expect(schedulesService.getActiveSchedulesInDateRange).toHaveBeenCalledWith(
      new Date('2026-08-17T00:00:00.000Z'),
      new Date('2026-08-24T00:00:00.000Z'),
    );
    expect(repository.findPendingForUsers).toHaveBeenCalledWith(
      [userId],
      new Date('2026-08-17T00:00:00.000Z'),
    );
    expect(inboxRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId,
        type: NotificationType.ScheduleReminder,
        dedupeKey: 'weekly-schedule-2026-08-17',
      }),
    ]);
    expect(webPushClient.send).toHaveBeenCalledTimes(1);

    const sendMock = webPushClient.send as jest.MockedFunction<
      (
        subscription: unknown,
        payload: string,
        options: unknown,
      ) => Promise<unknown>
    >;
    const rawPayload = sendMock.mock.calls[0][1];
    const payload = JSON.parse(
      typeof rawPayload === 'string' ? rawPayload : '',
    ) as { body: string; data: { url: string } };
    expect(payload.body).toContain('2 services:');
    expect(payload.body).toContain('Midweek (Leader, Acoustic)');
    expect(payload.body).toContain('Main (Acoustic)');
    expect(payload.data.url).toBe('/#my-serving-dates');
    expect(repository.markWeeklyReminderSent).toHaveBeenCalledWith(
      subscriptionId,
      new Date('2026-08-17T00:00:00.000Z'),
    );
    expect(result).toEqual({ sent: 1, failed: 0, expired: 0 });
  });

  it('removes expired endpoints and continues after transient failures', async () => {
    const secondSubscriptionId = new Types.ObjectId().toString();
    const scheduleId = new Types.ObjectId().toString();
    schedulesService.getActiveSchedulesInDateRange.mockResolvedValue([
      {
        _id: scheduleId,
        date: new Date('2026-08-23T00:00:00.000Z'),
        service_type: 'main',
        assignments: [{ worker_id: workerId, role: 'Leader' }],
      },
    ]);
    workersService.findWorkersByIds.mockResolvedValue([
      { _id: workerId, user_id: userId },
    ]);
    repository.findPendingForUsers.mockResolvedValue([
      {
        _id: subscriptionId,
        user_id: userId,
        endpoint: 'https://push.example/expired',
        p256dh: 'first-key',
        auth: 'first-auth',
      },
      {
        _id: secondSubscriptionId,
        user_id: userId,
        endpoint: 'https://push.example/failing',
        p256dh: 'second-key',
        auth: 'second-auth',
      },
    ]);
    webPushClient.send
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error('Network unavailable'));

    const result = await service.sendWeeklyReminders(
      new Date('2026-08-17T00:00:00.000Z'),
    );

    expect(repository.deleteById).toHaveBeenCalledWith(subscriptionId);
    expect(repository.markWeeklyReminderSent).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 1, expired: 1 });
  });

  it('skips unlinked, inactive, or unverified users', async () => {
    const scheduleId = new Types.ObjectId().toString();
    schedulesService.getActiveSchedulesInDateRange.mockResolvedValue([
      {
        _id: scheduleId,
        date: new Date('2026-08-23T00:00:00.000Z'),
        service_type: 'main',
        assignments: [{ worker_id: workerId, role: 'Leader' }],
      },
    ]);
    workersService.findWorkersByIds.mockResolvedValue([
      { _id: workerId, user_id: userId },
    ]);
    usersService.findById.mockResolvedValue({
      _id: userId,
      is_active: false,
      is_verified: true,
    });

    await expect(
      service.sendWeeklyReminders(new Date('2026-08-17T00:00:00.000Z')),
    ).resolves.toEqual({ sent: 0, failed: 0, expired: 0 });
    expect(repository.findPendingForUsers).not.toHaveBeenCalled();
  });

  it('stores inbox reminders even when VAPID is not configured', async () => {
    webPushClient.isConfigured.mockReturnValue(false);
    schedulesService.getActiveSchedulesInDateRange.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        date: new Date('2026-08-23T00:00:00.000Z'),
        service_type: 'main',
        assignments: [{ worker_id: workerId, role: 'Leader' }],
      },
    ]);
    workersService.findWorkersByIds.mockResolvedValue([
      { _id: workerId, user_id: userId },
    ]);

    await expect(
      service.sendWeeklyReminders(new Date('2026-08-17T00:00:00.000Z')),
    ).resolves.toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
    });
    expect(inboxRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId,
        type: NotificationType.ScheduleReminder,
      }),
    ]);
    expect(repository.findPendingForUsers).not.toHaveBeenCalled();
  });
});

const subscriptionDto = () => ({
  endpoint: 'https://push.example/subscription',
  expirationTime: null,
  keys: { p256dh: 'p256dh', auth: 'auth' },
});
