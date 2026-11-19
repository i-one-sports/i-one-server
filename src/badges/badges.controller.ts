import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from '@app/common';
import { BadgesService } from './badges.service';
import { ShareBadgeDto } from './dto/badges.dto';

@Controller('badges')
@UseGuards(JwtAuthGuard)
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  // All of the caller's badges, private ones included. `seenAt: null` means
  // the unlock pop-up hasn't been shown yet.
  @Get('me')
  async mine(@CurrentUser() user: any) {
    return this.badgesService.mine(this.userId(user));
  }

  // Another player's profile: shared badges only.
  @Get('user/:userId')
  async forProfile(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.badgesService.forProfile(userId, this.userId(user));
  }

  @Post(':badgeId/seen')
  async seen(@Param('badgeId') badgeId: string, @CurrentUser() user: any) {
    return this.badgesService.markSeen(badgeId, this.userId(user));
  }

  @Patch(':badgeId/share')
  async share(@Param('badgeId') badgeId: string, @Body() data: ShareBadgeDto, @CurrentUser() user: any) {
    return this.badgesService.setShared(badgeId, this.userId(user), data.shared);
  }

  private userId(user: any): string {
    return user?._id?.toString() || user?.id?.toString();
  }
}
