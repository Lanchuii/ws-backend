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

  async countAdmins(): Promise<number> {
    return await this.userModel.countDocuments({ role: UserRole.Admin }).exec();
  }
}
