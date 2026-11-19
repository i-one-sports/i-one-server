import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, USER_ROLE } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { NotificationOutboxService } from './notification-outbox.service';

// Delivery tracking for notifications sent through the outbox.
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLE.SUPER_ADMIN)
export class AdminNotificationsController {
  constructor(private readonly outbox: NotificationOutboxService) {}

  @Get('summary')
  async summary(@Query('hours') hours?: string) {
    return this.outbox.getSummary(hours ? Number(hours) : 24);
  }

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.outbox.list({ status, type, userId }, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    return this.outbox.retry(id);
  }
}
