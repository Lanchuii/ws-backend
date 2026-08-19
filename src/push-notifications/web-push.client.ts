import { Injectable } from '@nestjs/common';
import webPush, { PushSubscription, RequestOptions } from 'web-push';

@Injectable()
export class WebPushClient {
  private readonly publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  private readonly privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  private readonly subject = process.env.WEB_PUSH_VAPID_SUBJECT;

  constructor() {
    if (this.isConfigured()) {
      webPush.setVapidDetails(this.subject!, this.publicKey!, this.privateKey!);
    }
  }

  isConfigured() {
    return Boolean(this.publicKey && this.privateKey && this.subject);
  }

  getPublicKey() {
    return this.publicKey;
  }

  async send(
    subscription: PushSubscription,
    payload: string,
    options?: RequestOptions,
  ) {
    return await webPush.sendNotification(subscription, payload, options);
  }
}
