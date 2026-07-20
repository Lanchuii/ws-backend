import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/common/enums/user-role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows super admins through admin-protected endpoints', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);

    expect(guard.canActivate(contextFor(UserRole.SuperAdmin))).toBe(true);
  });

  it('rejects admins from super-admin-only endpoints', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SuperAdmin]);

    expect(guard.canActivate(contextFor(UserRole.Admin))).toBe(false);
  });

  it('rejects members from admin endpoints', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);

    expect(guard.canActivate(contextFor(UserRole.Member))).toBe(false);
  });

  function contextFor(role: UserRole) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role },
        }),
      }),
    } as unknown as ExecutionContext;
  }
});
