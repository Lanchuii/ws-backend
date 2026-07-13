import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PasswordService } from 'src/common/security/password.service';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async onModuleInit() {
    await this.ensureBootstrapAdmin();
  }

  async createUser(dto: CreateUserDto) {
    await this.ensureEmailIsAvailable(dto.email);

    const password_hash = await this.passwordService.hashPassword(dto.password);
    const user = await this.usersRepository.insertRecord({
      email: dto.email.toLowerCase(),
      username: dto.username,
      password_hash,
      role: dto.role || UserRole.Member,
      is_active: dto.is_active ?? true,
    } as any);

    return this.toPublicUser(user);
  }

  async getUsers() {
    const records = await this.usersRepository.getRecords({}, 1, 100, 'asc', 'email');

    return {
      ...records,
      items: records.items.map((user) => this.toPublicUser(user)),
    };
  }

  async findById(id: string) {
    return await this.usersRepository.getRecordById(id);
  }

  async getUserById(id: string) {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  async findByLogin(login: string) {
    const normalizedLogin = login.toLowerCase();
    const byEmail = await this.usersRepository.findByEmail(normalizedLogin);

    if (byEmail) {
      return byEmail;
    }

    return await this.usersRepository.findByUsername(login);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    if (dto.email) {
      const existing = await this.usersRepository.findByEmail(dto.email);

      if (existing && existing._id.toString() !== id) {
        throw new ConflictException('Email is already in use');
      }
    }

    const update: any = { ...dto };

    if (dto.email) {
      update.email = dto.email.toLowerCase();
    }

    if (dto.password) {
      update.password_hash = await this.passwordService.hashPassword(dto.password);
      delete update.password;
    }

    const user = await this.usersRepository.updateRecord({ _id: id } as any, update);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  async updateUserRole(id: string, role: UserRole) {
    const user = await this.usersRepository.updateRecord({ _id: id } as any, {
      role,
    } as any);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  toPublicUser(user: any) {
    if (!user) {
      return user;
    }

    const { password_hash, ...publicUser } = user;
    return publicUser;
  }

  private async ensureEmailIsAvailable(email: string) {
    const existing = await this.usersRepository.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email is already in use');
    }
  }

  private async ensureBootstrapAdmin() {
    const adminCount = await this.usersRepository.countAdmins();

    if (adminCount > 0) {
      return;
    }

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!email || !password) {
      return;
    }

    await this.createUser({
      email,
      password,
      username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
      role: UserRole.Admin,
      is_active: true,
    });
  }
}
