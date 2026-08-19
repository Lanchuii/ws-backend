import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { User } from 'src/users/schemas/users.schema';
import { WorkerGroup } from './schemas/worker-groups.schema';
import { WorkerGroupsModule } from './worker-groups.module';

describe('WorkerGroupsModule', () => {
  it('resolves the authentication guards and their user dependency', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerGroupsModule],
    })
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .overrideProvider(getModelToken(WorkerGroup.name))
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
