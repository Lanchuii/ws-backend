import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { WorkerGroupsRepository } from './repositories/worker-groups.repository';
import {
  WorkerGroup,
  WorkerGroupSchema,
} from './schemas/worker-groups.schema';
import { WorkerGroupsController } from './worker-groups.controller';
import { WorkerGroupsService } from './worker-groups.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkerGroup.name, schema: WorkerGroupSchema },
    ]),
    AuthModule,
  ],
  controllers: [WorkerGroupsController],
  providers: [WorkerGroupsService, WorkerGroupsRepository],
  exports: [WorkerGroupsService],
})
export class WorkerGroupsModule {}
