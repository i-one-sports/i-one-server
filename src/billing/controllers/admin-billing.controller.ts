import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
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

  @Post('fund-wallet')
  async fundWallet(
    @Body('userId') userId: string,
    @Body('amount') amount: number,
    @CurrentUser() admin: User,
  ) {
    const wallet = await this.walletService.getWalletByUserId(userId);

    const transaction = await this.walletService.creditWallet(
      wallet._id,
      amount,
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
