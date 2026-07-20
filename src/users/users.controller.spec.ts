import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { UsersController } from './users.controller';

describe('UsersController authorization', () => {
  it('restricts user management to super admins', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController);

    expect(roles).toEqual([UserRole.SuperAdmin]);
  });

  it('allows admins to retrieve linkable member accounts', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      UsersController.prototype.getLinkableUsers,
    );

    expect(roles).toEqual([UserRole.Admin]);
  });
});
