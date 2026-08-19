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
    requestPasswordReset: jest.fn(),
    getPendingPasswordResetRequests: jest.fn(),
    approvePasswordResetRequest: jest.fn(),
    rejectPasswordResetRequest: jest.fn(),
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

  it('submits a non-identifying password reset request', async () => {
    repository.requestPasswordReset.mockResolvedValue({
      _id: 'member-id',
      username: 'member',
      password_reset_requested_at: new Date(),
    });

    const result = await service.requestPasswordReset(' member ');

    expect(repository.requestPasswordReset).toHaveBeenCalledWith('member');
    expect(result.message).toContain(
      'If an eligible account matches that username',
    );
  });

  it('lists pending password reset requests without password data', async () => {
    const requestedAt = new Date('2026-08-19T10:00:00.000Z');
    repository.getPendingPasswordResetRequests.mockResolvedValue([
      {
        _id: 'member-id',
        email: 'member@example.com',
        username: 'member',
        password_hash: 'hidden',
        password_reset_requested_at: requestedAt,
      },
    ]);

    const result = await service.getPasswordResetRequests();

    expect(result).toEqual([
      {
        _id: 'member-id',
        email: 'member@example.com',
        username: 'member',
        requested_at: requestedAt,
      },
    ]);
  });

  it('hashes the temporary password and approves the pending request', async () => {
    passwordService.hashPassword.mockResolvedValue('temporary-password-hash');
    repository.approvePasswordResetRequest.mockResolvedValue({
      _id: 'member-id',
      password_reset_required: true,
    });

    const result = await service.approvePasswordResetRequest(
      'member-id',
      'temporary-password',
    );

    expect(passwordService.hashPassword).toHaveBeenCalledWith(
      'temporary-password',
    );
    expect(repository.approvePasswordResetRequest).toHaveBeenCalledWith(
      'member-id',
      'temporary-password-hash',
    );
    expect(result.message).toBe('Temporary password assigned successfully');
  });

  it('rejects a pending password reset request', async () => {
    repository.rejectPasswordResetRequest.mockResolvedValue({
      _id: 'member-id',
    });

    const result = await service.rejectPasswordResetRequest('member-id');

    expect(repository.rejectPasswordResetRequest).toHaveBeenCalledWith(
      'member-id',
    );
    expect(result.message).toBe('Password reset request rejected');
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
