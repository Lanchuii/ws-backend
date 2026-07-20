import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { AuthenticatedRequest } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const currentRole = request.user?.role as UserRole;
    const roleRank: Record<UserRole, number> = {
      [UserRole.Member]: 0,
      [UserRole.Admin]: 1,
      [UserRole.SuperAdmin]: 2,
    };

    return requiredRoles.some((requiredRole) => {
      return roleRank[currentRole] >= roleRank[requiredRole];
    });
  }
}
