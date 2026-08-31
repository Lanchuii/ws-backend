import { BadRequestException, HttpException } from '@nestjs/common';

export type ScheduleConflictCode =
  | 'WORKER_ALREADY_ASSIGNED'
  | 'WORKER_UNAVAILABLE'
  | 'DUPLICATE_WORKER_ASSIGNMENT'
  | 'MISSING_REQUIRED_ASSIGNMENT'
  | 'SCHEDULE_ALREADY_EXISTS'
  | 'INVALID_ASSIGNMENT'
  | 'INVALID_SCHEDULE_DATE';

export interface ScheduleConflict {
  code: ScheduleConflictCode;
  date: string;
  message: string;
  worker_id?: string;
  worker_name?: string;
  slot_key?: string;
  slot_label?: string;
  role?: string;
  blocking_schedule?: {
    id: string;
    service_type: string;
    role?: string;
    slot_key?: string;
  };
}

export const scheduleConflictException = (
  message: string,
  conflicts: ScheduleConflict[],
) =>
  new BadRequestException({
    message,
    errors: {
      code: 'SCHEDULE_VALIDATION_FAILED',
      conflicts,
    },
  });

export const getScheduleErrorMessage = (error: unknown) => {
  if (!(error instanceof HttpException)) {
    return error instanceof Error ? error.message : 'Schedule could not be saved';
  }

  const response = error.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as any)?.message;
  return Array.isArray(message) ? message.join(', ') : String(message ?? error.message);
};

export const getScheduleConflicts = (
  error: unknown,
  date: string,
): ScheduleConflict[] => {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response !== 'string') {
      const conflicts = (response as any)?.errors?.conflicts;
      if (Array.isArray(conflicts) && conflicts.length) {
        return conflicts;
      }
    }
  }

  const message = getScheduleErrorMessage(error);
  return [{
    code: 'INVALID_ASSIGNMENT',
    date,
    message,
  }];
};
