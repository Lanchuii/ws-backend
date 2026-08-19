import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SwapMode } from 'src/common/enums/swap-mode.enum';
import { SwapTargetResponse } from 'src/common/enums/swap-target-response.enum';
import { WorkerRequestStatus } from 'src/common/enums/worker-request-status.enum';
import { WorkerRequestType } from 'src/common/enums/worker-request-type.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerRequestsService } from './worker-requests.service';
import { SwapTargetDecision } from './dto/respond-swap-request.dto';

describe('WorkerRequestsService', () => {
  const userId = new Types.ObjectId().toString();
  const workerId = new Types.ObjectId().toString();
  const targetWorkerId = new Types.ObjectId().toString();
  const scheduleId = new Types.ObjectId().toString();
  const requestId = new Types.ObjectId().toString();
  const date = new Date('2026-09-06T00:00:00.000Z');
  const snapshot = {
    schedule_id: scheduleId,
    schedule_date: date,
    service_type: 'main',
    slot_key: 'leader',
    role: WorkerRole.Leader,
    worker_id: workerId,
    worker_name: 'Joshua',
  };
  const prepared = {
    source_snapshot: snapshot,
    replacement_worker: { _id: targetWorkerId, name: 'Mathew' },
    source_update: { schedule_id: scheduleId, assignments: [] },
  };
  const session = {
    withTransaction: jest.fn(async (callback) => await callback()),
    endSession: jest.fn(),
  };
  const connection = {
    startSession: jest.fn(async () => session),
  };
  const repository = {
    create: jest.fn(),
    findPendingUnavailable: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    updatePending: jest.fn(),
    updatePendingForTarget: jest.fn(),
    findLegacyPendingSwaps: jest.fn(),
  };
  const schedulesService = {
    prepareSwap: jest.fn(),
    getSwapOptions: jest.fn(),
    getWorkerAssignmentsOnDate: jest.fn(),
    executePreparedSwap: jest.fn(),
  };
  const unavailabilityService = {
    requireLinkedWorker: jest.fn(),
    assertWorkersAvailable: jest.fn(),
    activate: jest.fn(),
  };
  const pushNotificationsService = {
    notifyRequestCreated: jest.fn(),
    notifyRequestReviewed: jest.fn(),
    notifySwapTargetRequested: jest.fn(),
    notifySwapTargetResponded: jest.fn(),
  };
  const targetUserId = new Types.ObjectId().toString();
  const workersService = {
    getConsentEligibleWorker: jest.fn(),
  };
  let service: WorkerRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkerRequestsService(
      connection as any,
      repository as any,
      schedulesService as any,
      unavailabilityService as any,
      pushNotificationsService as any,
      workersService as any,
    );
    unavailabilityService.requireLinkedWorker.mockResolvedValue({
      _id: new Types.ObjectId(workerId),
      name: 'Joshua',
    });
    schedulesService.prepareSwap.mockResolvedValue(prepared);
    repository.create.mockImplementation(async (value) => value);
    pushNotificationsService.notifyRequestCreated.mockResolvedValue({
      sent: 0,
    });
    pushNotificationsService.notifyRequestReviewed.mockResolvedValue({
      sent: 0,
    });
    pushNotificationsService.notifySwapTargetRequested.mockResolvedValue({ sent: 0 });
    pushNotificationsService.notifySwapTargetResponded.mockResolvedValue({ sent: 0 });
    workersService.getConsentEligibleWorker.mockResolvedValue({
      worker: { _id: targetWorkerId, name: 'Mathew' },
      user: { _id: targetUserId, is_active: true, is_verified: true },
    });
  });

  it('creates a replacement request from the linked worker assignment', async () => {
    const result = await service.createSwap(userId, {
      mode: SwapMode.Replacement,
      source_schedule_id: scheduleId,
      source_slot_key: 'leader',
      target_worker_id: targetWorkerId,
      reason: 'Out of town',
    });

    expect(schedulesService.prepareSwap).toHaveBeenCalledWith(
      workerId,
      SwapMode.Replacement,
      scheduleId,
      'leader',
      targetWorkerId,
      undefined,
      undefined,
    );
    expect(result).toMatchObject({
      type: WorkerRequestType.Swap,
      status: WorkerRequestStatus.Pending,
      requester_worker_name: 'Joshua',
      target_worker_name: 'Mathew',
      target_response: SwapTargetResponse.Pending,
    });
    expect(pushNotificationsService.notifySwapTargetRequested).toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkerRequestType.Swap }),
    );
  });

  it('prevents duplicate pending unavailable requests', async () => {
    repository.findPendingUnavailable.mockResolvedValue({ _id: requestId });
    unavailabilityService.assertWorkersAvailable.mockResolvedValue(undefined);

    await expect(
      service.createUnavailable(userId, {
        date: '2099-09-06',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records target acceptance without applying the swap', async () => {
    const request = {
      _id: new Types.ObjectId(requestId),
      type: WorkerRequestType.Swap,
      status: WorkerRequestStatus.Pending,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_name: 'Joshua',
      target_user_id: new Types.ObjectId(targetUserId),
      target_worker_name: 'Mathew',
      target_response: SwapTargetResponse.Pending,
    };
    repository.findById.mockResolvedValue(request);
    repository.updatePendingForTarget.mockResolvedValue({
      ...request,
      target_response: SwapTargetResponse.Accepted,
    });

    const result = await service.respondToSwap(
      requestId,
      targetUserId,
      SwapTargetDecision.Accept,
    );

    expect(result.target_response).toBe(SwapTargetResponse.Accepted);
    expect(schedulesService.executePreparedSwap).not.toHaveBeenCalled();
    expect(pushNotificationsService.notifySwapTargetResponded).toHaveBeenCalled();
  });

  it('approves and executes a valid replacement in one transaction', async () => {
    const storedSnapshot = {
      ...snapshot,
      schedule_id: new Types.ObjectId(scheduleId),
      worker_id: new Types.ObjectId(workerId),
    };
    const request = {
      _id: new Types.ObjectId(requestId),
      type: WorkerRequestType.Swap,
      swap_mode: SwapMode.Replacement,
      status: WorkerRequestStatus.Pending,
      requester_worker_id: new Types.ObjectId(workerId),
      source_assignment: storedSnapshot,
      target_worker_id: new Types.ObjectId(targetWorkerId),
      target_response: SwapTargetResponse.Accepted,
    };
    repository.findById.mockResolvedValue(request);
    repository.updatePending.mockResolvedValue({
      ...request,
      status: WorkerRequestStatus.Approved,
    });

    const result = await service.approve(requestId, userId);

    expect(schedulesService.executePreparedSwap).toHaveBeenCalledWith(
      prepared,
      session,
    );
    expect(result.status).toBe(WorkerRequestStatus.Approved);
    expect(pushNotificationsService.notifyRequestReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ status: WorkerRequestStatus.Approved }),
    );
    expect(session.endSession).toHaveBeenCalled();
  });

  it('notifies the requester when an admin rejects a request', async () => {
    const request = {
      _id: new Types.ObjectId(requestId),
      type: WorkerRequestType.Unavailable,
      status: WorkerRequestStatus.Pending,
      requester_user_id: new Types.ObjectId(userId),
      requester_worker_id: new Types.ObjectId(workerId),
      requester_worker_name: 'Joshua',
      unavailable_date: date,
    };
    repository.findById.mockResolvedValue(request);
    repository.updatePending.mockResolvedValue({
      ...request,
      status: WorkerRequestStatus.Rejected,
      reviewer_note: 'Team coverage is incomplete.',
    });

    await service.reject(
      requestId,
      new Types.ObjectId().toString(),
      'Team coverage is incomplete.',
    );

    expect(pushNotificationsService.notifyRequestReviewed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: WorkerRequestStatus.Rejected,
        requester_user_id: request.requester_user_id,
      }),
    );
  });

  it('keeps unavailable requests pending while assignments still exist', async () => {
    repository.findById.mockResolvedValue({
      _id: new Types.ObjectId(requestId),
      type: WorkerRequestType.Unavailable,
      status: WorkerRequestStatus.Pending,
      requester_worker_id: new Types.ObjectId(workerId),
      unavailable_date: date,
    });
    schedulesService.getWorkerAssignmentsOnDate.mockResolvedValue([
      { _id: scheduleId, date, service_type: 'main' },
    ]);

    await expect(service.approve(requestId, userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(unavailabilityService.activate).not.toHaveBeenCalled();
    expect(repository.updatePending).not.toHaveBeenCalled();
  });

  it('marks a stale swap failed without changing schedules', async () => {
    const request = {
      _id: new Types.ObjectId(requestId),
      type: WorkerRequestType.Swap,
      swap_mode: SwapMode.Replacement,
      status: WorkerRequestStatus.Pending,
      requester_worker_id: new Types.ObjectId(workerId),
      source_assignment: {
        ...snapshot,
        schedule_id: new Types.ObjectId(scheduleId),
        worker_id: new Types.ObjectId(workerId),
      },
      target_worker_id: new Types.ObjectId(targetWorkerId),
      target_response: SwapTargetResponse.Accepted,
    };
    repository.findById
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce({ ...request, status: WorkerRequestStatus.Failed });
    repository.updatePending.mockResolvedValue({
      ...request,
      status: WorkerRequestStatus.Failed,
    });
    schedulesService.prepareSwap.mockRejectedValue(
      new BadRequestException('Assignment changed'),
    );

    const result = await service.approve(requestId, userId);

    expect(result.status).toBe(WorkerRequestStatus.Failed);
    expect(schedulesService.executePreparedSwap).not.toHaveBeenCalled();
  });
});
