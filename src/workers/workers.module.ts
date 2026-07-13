import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { WorkersController } from './workers.controller';
import { WorkersRepository } from './repositories/workers.repository';
import { Worker, WorkerSchema } from './schemas/workers.schema';
import { WorkersService } from './workers.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Worker.name, schema: WorkerSchema }]),
    AuthModule,
  ],
  controllers: [WorkersController],
  providers: [WorkersService, WorkersRepository],
  exports: [WorkersService],
})
export class WorkersModule {}
