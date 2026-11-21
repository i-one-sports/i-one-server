import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, IsOwnerGuard, User } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { MonthlyPassService } from '../services/monthly-pass.service';

// Monthly passes for players (buy, see their passes) and pitch owners (who
// holds a pass, pass income). Paths sit beside the existing `location` and
// `user` routes.
@Controller()
@UseGuards(JwtAuthGuard)
export class MonthlyPassController {
  constructor(private readonly monthlyPassService: MonthlyPassService) {}

  // Opens (or returns the open) Paystack checkout for a 30-day pass.
  @Post('location/:locationId/monthly-pass/checkout')
  checkout(@Param('locationId') locationId: string, @CurrentUser() user: User) {
    return this.monthlyPassService.checkout(locationId, { _id: user._id, email: user.email });
  }

  // This pitch's pass price and the player's current / queued pass there.
  @Get('location/:locationId/monthly-pass/me')
  myPassAtPitch(@Param('locationId') locationId: string, @CurrentUser() user: User) {
    return this.monthlyPassService.myPassAtPitch(locationId, user._id);
  }

  // Owner: who holds a pass now or queued, and pass income.
  @UseGuards(IsOwnerGuard)
  @Get('location/:locationId/monthly-passes')
  ownerOverview(@Param('locationId') locationId: string, @CurrentUser() user: User) {
    return this.monthlyPassService.ownerOverview(locationId, user._id);
  }

  // Every pass the player has (active, queued, expired, pending, refunds).
  @Get('user/monthly-passes')
  myPasses(@CurrentUser() user: User) {
    return this.monthlyPassService.myPasses(user._id);
  }
}
