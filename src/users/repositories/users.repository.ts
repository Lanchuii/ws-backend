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

  async requestPasswordReset(username: string) {
    return await this.userModel
      .findOneAndUpdate(
        {
          username,
          is_active: true,
          is_verified: { $ne: false },
          password_reset_requested_at: { $exists: false },
        },
        { $set: { password_reset_requested_at: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async getPendingPasswordResetRequests() {
    return await this.userModel
      .find({ password_reset_requested_at: { $exists: true } })
      .select('_id email username password_reset_requested_at')
      .sort({ password_reset_requested_at: 1 })
      .lean()
      .exec();
  }

  async approvePasswordResetRequest(id: string, passwordHash: string) {
    return await this.userModel
      .findOneAndUpdate(
        { _id: id, password_reset_requested_at: { $exists: true } },
        {
          $set: {
            password_hash: passwordHash,
            password_reset_required: true,
          },
          $unset: { password_reset_requested_at: 1 },
          $inc: { token_version: 1 },
        },
        { new: true },
      )
      .select('+token_version')
      .lean()
      .exec();
  }

  async rejectPasswordResetRequest(id: string) {
    return await this.userModel
      .findOneAndUpdate(
        { _id: id, password_reset_requested_at: { $exists: true } },
        { $unset: { password_reset_requested_at: 1 } },
        { new: true },
      )
      .lean()
      .exec();
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

  async completePasswordReset(id: string, passwordHash: string) {
    return await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            password_hash: passwordHash,
            password_reset_required: false,
          },
          $unset: { password_reset_requested_at: 1 },
          $inc: { token_version: 1 },
        },
        { new: true },
      )
      .select('+token_version')
      .lean()
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
