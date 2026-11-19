import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { USER_ROLE } from '@app/common';
import { CurrentUser } from '@app/common/decorators/currentUser.decorator';
import { User } from '@app/common/schemas/user.schema';
import { WalletService } from '../services/wallet.service';
import { SessionPaymentService } from '../services/session-payment.service';
import { randomUUID } from 'crypto';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { FundWalletDto } from '../dto/wallet.dto';

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLE.SUPER_ADMIN)
export class AdminBillingController {
  constructor(
    private readonly walletService: WalletService,
    private readonly sessionPaymentService: SessionPaymentService,
  ) {}

  @Get('commission-summary')
  async commissionSummary() {
    return this.sessionPaymentService.getCommissionSummary();
  }

  // i-One's platform wallet (commission + processing-fee surplus) and what
  // is owed to pitch owners — together, the money that should be held.
  @Get('platform')
  async platformOverview() {
    return this.sessionPaymentService.getPlatformOverview();
  }

  // Rebuilds a POOL session's paid/reserved counters from its payment rows.
  @Post('sessions/:sessionId/recompute-pool')
  async recomputePool(@Param('sessionId') sessionId: string) {
    return this.sessionPaymentService.recomputePool(sessionId);
  }

  @Post('fund-wallet')
  async fundWallet(
    @Body() dto: FundWalletDto,
    @CurrentUser() admin: User,
  ) {
    const wallet = await this.walletService.getWalletByUserId(dto.userId);

    const transaction = await this.walletService.creditWallet(
      wallet._id,
      dto.amount,
      TransactionSource.ADMIN_FUNDING,
      `ADMIN_FUND_${randomUUID()}`,
      { fundedBy: admin._id.toString() },
      undefined,
      admin._id,
    );

    return {
      message: 'Wallet funded successfully',
      transaction,
    };
  }
}
