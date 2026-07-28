import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UsersModule } from 'src/users/users.module';
import { WorkersController } from './workers.controller';
import { WorkersRepository } from './repositories/workers.repository';
import { Worker, WorkerSchema } from './schemas/workers.schema';
import { WorkersService } from './workers.service';
import { WorkerGroupsModule } from 'src/worker-groups/worker-groups.module';
import { SongsModule } from 'src/songs/songs.module';
import {
  LeaderRepertoire,
  LeaderRepertoireSchema,
} from './schemas/leader-repertoire.schema';
import { LeaderRepertoireRepository } from './repositories/leader-repertoire.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Worker.name, schema: WorkerSchema },
      { name: LeaderRepertoire.name, schema: LeaderRepertoireSchema },
    ]),
    AuthModule,
    UsersModule,
    WorkerGroupsModule,
    SongsModule,
  ],
  controllers: [WorkersController],
  providers: [
    WorkersService,
    WorkersRepository,
    LeaderRepertoireRepository,
  ],
  exports: [WorkersService],
})
export class WorkersModule {}
