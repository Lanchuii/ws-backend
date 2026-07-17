import { WorkerSchema } from './workers.schema';

describe('WorkerSchema', () => {
  it('casts linked user IDs as MongoDB ObjectIds', () => {
    expect(WorkerSchema.path('user_id')?.instance).toBe('ObjectId');
  });
});
