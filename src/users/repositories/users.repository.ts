import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import { UserRole } from 'src/common/enums/user-role.enum';
import { User, UserDocument } from '../schemas/users.schema';

export class UsersRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    super(userModel);
  }

  async findByEmail(email: string) {
    return await this.userModel
      .findOne({ email: email.toLowerCase() })
      .lean()
      .exec();
  }

  async findByUsername(username: string) {
    return await this.userModel.findOne({ username }).lean().exec();
  }

  async countSuperAdmins(): Promise<number> {
    return await this.userModel
      .countDocuments({ role: UserRole.SuperAdmin })
      .exec();
  }

  async countUsableSuperAdmins(): Promise<number> {
    return await this.userModel
      .countDocuments({
        role: UserRole.SuperAdmin,
        is_active: true,
        is_verified: true,
      })
      .exec();
  }

  async findOldestAdmin() {
    return await this.userModel
      .findOne({ role: UserRole.Admin })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();
  }

  async findActiveByRoles(roles: UserRole[]) {
    return await this.userModel
      .find({
        role: { $in: roles },
        is_active: true,
        is_verified: true,
      })
      .select('_id role')
      .lean()
      .exec();
  }

  async markLegacyUsersVerified() {
    return await this.userModel
      .updateMany(
        { is_verified: { $exists: false } },
        { $set: { is_verified: true } },
      )
      .exec();
  }

  async getLinkableUsers() {
    return await this.userModel
      .find({
        role: UserRole.Member,
        is_active: true,
        is_verified: true,
      })
      .select('_id email username role is_active is_verified')
      .sort({ email: 1 })
      .lean()
      .exec();
  }
}
