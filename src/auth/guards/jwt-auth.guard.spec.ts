import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard password reset enforcement', () => {
  const request = {
    headers: { authorization: 'Bearer access-token' },
    user: undefined as unknown,
  };
  const jwtService = {
    verifyAsync: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new JwtAuthGuard(
    jwtService as unknown as JwtService,
    usersService as unknown as UsersService,
    reflector as unknown as Reflector,
  );
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    request.user = undefined;
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      type: 'access',
      token_version: 0,
    });
    usersService.findById.mockResolvedValue({
      _id: 'user-id',
      email: 'member@example.com',
      role: 'member',
      is_active: true,
      is_verified: true,
      password_reset_required: true,
      token_version: 0,
    });
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('blocks normal protected routes while reset is required', async () => {
    let caught: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({
      message: 'Password reset required',
      errors: { code: 'PASSWORD_RESET_REQUIRED' },
    });
  });

  it('allows the dedicated password reset route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: 'user-id',
      password_reset_required: true,
    });
  });

  it('rejects tokens from before a completed password reset', async () => {
    usersService.findById.mockResolvedValue({
      _id: 'user-id',
      is_active: true,
      is_verified: true,
      password_reset_required: false,
      token_version: 1,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
