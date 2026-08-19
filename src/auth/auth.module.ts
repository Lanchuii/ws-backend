import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SecurityModule } from 'src/common/security/security.module';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [JwtModule.register({}), SecurityModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, UsersModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
