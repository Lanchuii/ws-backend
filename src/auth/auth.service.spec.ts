import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from 'src/common/enums/user-role.enum';
import { PasswordService } from 'src/common/security/password.service';
import { UsersService } from 'src/users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByLogin: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    toPublicUser: jest.fn((user) => {
      const { password_hash, ...publicUser } = user;
      return publicUser;
    }),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('returns tokens for valid login', async () => {
    usersService.findByLogin.mockResolvedValue(user());
    passwordService.verifyPassword.mockResolvedValue(true);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.login({
      login: 'admin@example.com',
      password: 'password123',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.password_hash).toBeUndefined();
  });

  it('rejects invalid login', async () => {
    usersService.findByLogin.mockResolvedValue(user());
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login({ login: 'admin@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login while an account is pending verification', async () => {
    usersService.findByLogin.mockResolvedValue({
      ...user(),
      is_verified: false,
    });
    passwordService.verifyPassword.mockResolvedValue(true);

    await expect(
      service.login({
        login: 'admin@example.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a pending member without issuing tokens on signup', async () => {
    usersService.createUser.mockResolvedValue({
      ...user(),
      role: UserRole.Member,
      is_verified: false,
    });

    const result = await service.signup({
      email: 'member@example.com',
      username: 'member',
      password: 'password123',
    });

    expect(usersService.createUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      username: 'member',
      password: 'password123',
      role: UserRole.Member,
      is_active: true,
      is_verified: false,
    });
    expect(result.verificationRequired).toBe(true);
    expect(result).not.toHaveProperty('accessToken');
  });

  it('returns new tokens for a valid refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      type: 'refresh',
    });
    usersService.findById.mockResolvedValue(user());
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    const result = await service.refresh({ refreshToken: 'refresh-token' });

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
    expect(usersService.findById).toHaveBeenCalledWith('user-id');
  });

  it('rejects refresh tokens for unverified users', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      type: 'refresh',
    });
    usersService.findById.mockResolvedValue({
      ...user(),
      is_verified: false,
    });

    await expect(
      service.refresh({ refreshToken: 'refresh-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  function user() {
    return {
      _id: 'user-id',
      email: 'admin@example.com',
      username: 'admin',
      password_hash: 'hash',
      role: UserRole.Admin,
      is_active: true,
      is_verified: true,
    };
  }
});
