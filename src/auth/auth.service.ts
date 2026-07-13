import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from 'src/common/security/password.service';
import { UserRole } from 'src/common/enums/user-role.enum';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByLogin(dto.login);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async signup(dto: SignupDto) {
    const user = await this.usersService.createUser({
      ...dto,
      role: UserRole.Member,
      is_active: true,
    });

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-refresh-secret',
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findById(payload.sub);

      if (!user || !user.is_active) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: process.env.JWT_SECRET || 'dev-access-secret',
          expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-refresh-secret',
          expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      user: this.usersService.toPublicUser(user),
    };
  }
}
