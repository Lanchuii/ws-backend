import { IsEnum } from 'class-validator';
import { UserRole } from 'src/common/enums/user-role.enum';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
