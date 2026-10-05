import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post, Res, Sse, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { merge, interval, Observable } from 'rxjs';
import { map, startWith, finalize } from 'rxjs/operators';
import { CurrentUser, Roles, RolesGuard, USER_ROLE } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { NotificationService } from './notification.service';
import { BroadcastNotificationDto, SendTestPushDto } from './dto/notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Sse('stream')
  stream(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Observable<any> {
    const userId = user?._id?.toString() || user?.id?.toString();

    if (!userId) {
      throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const heartbeat$ = interval(30000).pipe(
      map(() => ({ data: { type: 'heartbeat', timestamp: Date.now() } })),
    );

    const notifications$ = this.notificationService.getStream(userId).pipe(
      map((notification) => ({ data: notification })),
    );

    return merge(notifications$, heartbeat$).pipe(
      startWith({ data: { type: 'connected', userId, timestamp: Date.now() } }),
    );
  }

  @UseGuards(RolesGuard)
  @Roles(USER_ROLE.SUPER_ADMIN)
  @Post('broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  async broadcast(@Body() data: BroadcastNotificationDto) {
    this.notificationService
      .broadcastToAllUsers(data.title, data.body)
      .then((result) =>
        this.logger.log(`Broadcast complete: ${result.sent}/${result.totalUsers} sent`),
      )
      .catch((err) => this.logger.error('Broadcast failed', err));

    return { message: 'Broadcast started' };
  }

  // @UseGuards(RolesGuard)
  // @Roles(USER_ROLE.SUPER_ADMIN)
  @Post('test-push')
  async testPush(@Body() data: SendTestPushDto) {
    await this.notificationService.sendTestPush(data.fcmToken, data.title, data.body);
    return { message: 'Test push sent' };
  }
}
