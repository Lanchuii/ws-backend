import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_RESET_KEY = 'allow_password_reset';
export const AllowPasswordReset = () =>
  SetMetadata(ALLOW_PASSWORD_RESET_KEY, true);
