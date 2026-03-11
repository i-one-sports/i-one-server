import { Controller, HttpException, HttpStatus, Res, Sse, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { merge, interval, Observable } from 'rxjs';
import { map, startWith, finalize } from 'rxjs/operators';
import { CurrentUser } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
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
}
