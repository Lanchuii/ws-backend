import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UsersModule } from 'src/users/users.module';
import { WorkersController } from './workers.controller';
import { WorkersRepository } from './repositories/workers.repository';
import { Worker, WorkerSchema } from './schemas/workers.schema';
import { WorkersService } from './workers.service';
import { WorkerGroupsModule } from 'src/worker-groups/worker-groups.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Worker.name, schema: WorkerSchema }]),
    AuthModule,
    UsersModule,
    WorkerGroupsModule,
  ],
  controllers: [WorkersController],
  providers: [WorkersService, WorkersRepository],
  exports: [WorkersService],
})
export class WorkersModule {}
