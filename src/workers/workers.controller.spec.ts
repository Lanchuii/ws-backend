import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

describe('WorkersController', () => {
  let controller: WorkersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [WorkersController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: WorkersService,
          useValue: {
            getWorkers: jest.fn(),
            getWorkerById: jest.fn(),
            updateMyLeaderSongs: jest.fn(),
            createWorker: jest.fn(),
            updateWorker: jest.fn(),
            deleteWorker: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WorkersController>(WorkersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
