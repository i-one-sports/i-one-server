import { Logger } from '@nestjs/common';

export abstract class BaseNotificationChannel<P> {
  protected abstract readonly logger: Logger;
  protected abstract dispatch(params: P): Promise<void>;

  async send(params: P): Promise<void> {
    try {
      await this.dispatch(params);
      this.logger.log('Notification sent successfully');
    } catch (error: any) {
      this.logger.error(`Notification failed: ${error.message}`);
    }
  }
}
