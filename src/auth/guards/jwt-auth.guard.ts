import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from 'src/users/users.service';
import { ALLOW_PASSWORD_RESET_KEY } from '../decorators/allow-password-reset.decorator';

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    username?: string;
    role: string;
    password_reset_required: boolean;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-access-secret',
      });

      if (payload?.type && payload.type !== 'access') {
        throw new UnauthorizedException('Invalid access token');
      }

    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.usersService.findById(payload.sub);
    const tokenVersion = Number(payload.token_version ?? 0);
    const currentTokenVersion = Number(user?.token_version ?? 0);

    if (
      !user ||
      !user.is_active ||
      user.is_verified === false ||
      tokenVersion !== currentTokenVersion
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const resetRequired = user.password_reset_required === true;
    const allowPasswordReset = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_RESET_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (resetRequired && !allowPasswordReset) {
      throw new ForbiddenException({
        message: 'Password reset required',
        errors: { code: 'PASSWORD_RESET_REQUIRED' },
      });
    }

    request.user = {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
      password_reset_required: resetRequired,
    };

    return true;
  }
}
