import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from 'src/common/enums/user-role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ trim: true })
  username?: string;

  @Prop({ required: true })
  password_hash!: string;

  @Prop({ type: String, enum: Object.values(UserRole), default: UserRole.Member })
  role!: UserRole;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ default: false })
  is_verified!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
