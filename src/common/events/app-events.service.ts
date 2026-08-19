import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface PasswordResetRequestedEvent {
  _id: { toString(): string } | string;
  username?: string;
  password_reset_requested_at: Date | string;
}

@Injectable()
export class AppEventsService {
  private readonly passwordResetRequestedSubject =
    new Subject<PasswordResetRequestedEvent>();

  readonly passwordResetRequested$ =
    this.passwordResetRequestedSubject.asObservable();

  emitPasswordResetRequested(event: PasswordResetRequestedEvent) {
    this.passwordResetRequestedSubject.next(event);
  }
}
