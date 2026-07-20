import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkerGroupsService } from './worker-groups.service';

describe('WorkerGroupsService', () => {
  const repository = {
    createIfMissing: jest.fn(),
    findAll: jest.fn(),
    findByCodes: jest.fn(),
    findByIds: jest.fn(),
    getRecord: jest.fn(),
    insertRecord: jest.fn(),
    updateRecord: jest.fn(),
  };
  let service: WorkerGroupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkerGroupsService(repository as any);
  });

  it('normalizes a new worker group code', async () => {
    repository.getRecord.mockResolvedValue(null);
    repository.insertRecord.mockImplementation(async (value) => value);

    const result = await service.createWorkerGroup({
      code: 'Young Adults',
      name: 'Young Adults',
    });

    expect(result.code).toBe('young_adults');
  });

  it('rejects duplicate worker group codes', async () => {
    repository.getRecord.mockResolvedValue({ _id: 'existing' });

    await expect(
      service.createWorkerGroup({ code: 'main', name: 'Main' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unknown group ids used by service eligibility', async () => {
    repository.findByIds.mockResolvedValue([]);

    await expect(service.assertIdsExist(['507f1f77bcf86cd799439011']))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
