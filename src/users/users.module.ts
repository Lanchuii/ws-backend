import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { SecurityModule } from 'src/common/security/security.module';
import { User, UserSchema } from './schemas/users.schema';
import { UsersController } from './users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({}),
    SecurityModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, JwtAuthGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
