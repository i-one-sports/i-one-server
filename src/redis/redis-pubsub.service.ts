import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;

  // channel -> set of handlers registered by different services
  private handlers = new Map<string, Set<(message: string) => void>>();

  private createClient(): Redis {
    return new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  constructor() {
    this.publisher = this.createClient();
    this.subscriber = this.createClient();

    // Single message handler routes to the correct service handlers by channel
    this.subscriber.on('message', (channel, message) => {
      const channelHandlers = this.handlers.get(channel);
      if (!channelHandlers) return;
      channelHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (err) {
          this.logger.error(`Handler error on channel "${channel}"`, err);
        }
      });
    });

    this.logger.log('RedisPubSubService ready (1 publisher + 1 subscriber)');
  }

  async onModuleDestroy() {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
    this.logger.log('RedisPubSubService connections closed');
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await this.subscriber.subscribe(channel);
      this.logger.log(`Subscribed to Redis channel "${channel}"`);
    }
    this.handlers.get(channel)!.add(handler);
  }

  async unsubscribe(channel: string, handler: (message: string) => void): Promise<void> {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) return;

    channelHandlers.delete(handler);

    if (channelHandlers.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
      this.logger.log(`Unsubscribed from Redis channel "${channel}"`);
    }
  }
}
