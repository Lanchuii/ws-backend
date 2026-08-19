import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from 'src/common/enums/user-role.enum';
import { PasswordService } from 'src/common/security/password.service';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    markLegacyUsersVerified: jest.fn(),
    countSuperAdmins: jest.fn(),
    countUsableSuperAdmins: jest.fn(),
    findOldestAdmin: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    insertRecord: jest.fn(),
    getRecords: jest.fn(),
    getRecordById: jest.fn(),
    updateRecord: jest.fn(),
    completePasswordReset: jest.fn(),
    getLinkableUsers: jest.fn(),
  };
  const passwordService = {
    hashPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
        { provide: PasswordService, useValue: passwordService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    repository.markLegacyUsersVerified.mockResolvedValue({});
    repository.countSuperAdmins.mockResolvedValue(1);
    repository.countUsableSuperAdmins.mockResolvedValue(1);
    repository.findByEmail.mockResolvedValue(null);
    passwordService.hashPassword.mockResolvedValue('password-hash');
  });

  it('marks legacy users verified before bootstrap checks', async () => {
    await service.onModuleInit();

    expect(repository.markLegacyUsersVerified).toHaveBeenCalled();
    expect(repository.countSuperAdmins).toHaveBeenCalled();
  });

  it('promotes the oldest admin when no super admin exists', async () => {
    repository.countSuperAdmins.mockResolvedValue(0);
    repository.findOldestAdmin.mockResolvedValue({
      _id: 'oldest-admin-id',
      role: UserRole.Admin,
    });
    repository.updateRecord.mockResolvedValue({
      _id: 'oldest-admin-id',
      role: UserRole.SuperAdmin,
      is_active: true,
      is_verified: true,
    });

    await service.onModuleInit();

    expect(repository.updateRecord).toHaveBeenCalledWith(
      { _id: 'oldest-admin-id' },
      {
        role: UserRole.SuperAdmin,
        is_active: true,
        is_verified: true,
      },
    );
  });

  it('creates super-admin-managed users as verified by default', async () => {
    repository.insertRecord.mockImplementation(async (user) => ({
      _id: 'user-id',
      ...user,
    }));

    const user = await service.createUser({
      email: 'member@example.com',
      password: 'password123',
    });

    expect(user.is_verified).toBe(true);
    expect(repository.insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRole.Member,
        is_active: true,
        is_verified: true,
      }),
    );
  });

  it('prevents demoting the last usable super admin', async () => {
    repository.getRecordById.mockResolvedValue({
      _id: 'super-admin-id',
      role: UserRole.SuperAdmin,
      is_active: true,
      is_verified: true,
    });
    repository.countUsableSuperAdmins.mockResolvedValue(1);

    await expect(
      service.updateUserRole('super-admin-id', UserRole.Admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['deactivating', { is_active: false }],
    ['unverifying', { is_verified: false }],
  ])('prevents %s the last usable super admin', async (_label, changes) => {
    repository.getRecordById.mockResolvedValue({
      _id: 'super-admin-id',
      role: UserRole.SuperAdmin,
      is_active: true,
      is_verified: true,
    });
    repository.countUsableSuperAdmins.mockResolvedValue(1);

    if ('is_active' in changes) {
      await expect(
        service.updateUser('super-admin-id', changes),
      ).rejects.toBeInstanceOf(ConflictException);
      return;
    }

    await expect(
      service.updateUserVerification(
        'super-admin-id',
        changes.is_verified as boolean,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows approval when another usable super admin remains', async () => {
    repository.getRecordById.mockResolvedValue({
      _id: 'member-id',
      role: UserRole.Member,
      is_active: true,
      is_verified: false,
    });
    repository.updateRecord.mockResolvedValue({
      _id: 'member-id',
      role: UserRole.Member,
      is_active: true,
      is_verified: true,
    });

    const user = await service.updateUserVerification('member-id', true);

    expect(user.is_verified).toBe(true);
  });

  it('lets a super admin mark an account for a required password reset', async () => {
    repository.updateRecord.mockResolvedValue({
      _id: 'member-id',
      email: 'member@example.com',
      password_hash: 'hash',
      password_reset_required: true,
    });

    const user = await service.updatePasswordResetRequirement(
      'member-id',
      true,
    );

    expect(repository.updateRecord).toHaveBeenCalledWith(
      { _id: 'member-id' },
      { password_reset_required: true },
    );
    expect(user.password_reset_required).toBe(true);
    expect(user.password_hash).toBeUndefined();
  });

  it('hashes the new password, clears the requirement, and rotates tokens', async () => {
    repository.getRecordById.mockResolvedValue({
      _id: 'member-id',
      password_reset_required: true,
    });
    repository.completePasswordReset.mockResolvedValue({
      _id: 'member-id',
      password_hash: 'new-password-hash',
      password_reset_required: false,
      token_version: 2,
    });
    passwordService.hashPassword.mockResolvedValue('new-password-hash');

    const user = await service.completeRequiredPasswordReset(
      'member-id',
      'new-password',
    );

    expect(passwordService.hashPassword).toHaveBeenCalledWith('new-password');
    expect(repository.completePasswordReset).toHaveBeenCalledWith(
      'member-id',
      'new-password-hash',
    );
    expect(user.token_version).toBe(2);
  });
});
