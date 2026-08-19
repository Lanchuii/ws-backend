import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AllowPasswordReset } from './decorators/allow-password-reset.decorator';
import type { AuthenticatedRequest } from './guards/jwt-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return await this.authService.signup(dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return await this.authService.refresh(dto);
  }

  @Post('reset-password')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordReset()
  async resetPassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ResetPasswordDto,
  ) {
    return await this.authService.resetPassword(request.user.sub, dto);
  }
}
