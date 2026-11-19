import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { IsOwnerGuard } from '@app/common';
import { LocationBillingService } from '../services/location-billing.service';

@Controller('billing/location')
@UseGuards(JwtAuthGuard, IsOwnerGuard)
export class LocationBillingController {
  constructor(private readonly locationBillingService: LocationBillingService) {}

  /**
   * GET /billing/location/:locationId/transactions?page=1&limit=20
   * Paginated daily-grouped transaction history for a location owner,
   * broken down per team (Set) per session.
   */
  @Get(':locationId/transactions')
  async getTransactionHistory(
    @Request() req: any,
    @Param('locationId') locationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const ownerId: string = req.user._id ?? req.user.id ?? req.user.sub;
    return this.locationBillingService.getOwnerTransactionHistory(
      ownerId,
      locationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * GET /billing/location/:locationId/sessions/:sessionId/team-status
   * Per-team payment status for a single session:
   * shows each team, which players paid, expected vs collected, shortfall.
   */
  @Get(':locationId/sessions/:sessionId/team-status')
  async getSessionTeamStatus(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ) {
    const ownerId: string = req.user._id ?? req.user.id ?? req.user.sub;
    return this.locationBillingService.getSessionTeamPaymentStatus(
      sessionId,
      ownerId,
    );
  }
}
