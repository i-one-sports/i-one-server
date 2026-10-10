import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Patch, Sse, Header } from '@nestjs/common';
import { from, merge, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { IsOwnerGuard } from '@app/common/guards/is-owner.guard';
import { RolesGuard } from '@app/common/guards/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { USER_ROLE } from '@app/common';
import { CurrentUser } from '@app/common/decorators/currentUser.decorator';
import { User } from '@app/common/schemas/user.schema';
import { WalletService } from '../services/wallet.service';
import { SessionPaymentService } from '../services/session-payment.service';
import { WithdrawalService } from '../services/withdrawal.service';
import { AddBankAccountDto, WithdrawFundsDto } from '../dto/withdrawal.dto';
import { SessionCheckoutDto } from '../dto/session-payment.dto';
import { SessionPaymentEventService } from '../services/session-payment-event.service';
import { CanViewPoolGuard } from '../guards/can-view-pool.guard';
import { CanViewSessionPaymentsGuard } from '../guards/can-view-session-payments.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly withdrawalService: WithdrawalService,
    private readonly sessionPaymentEventService: SessionPaymentEventService,
  ) {}

  @Get('me')
  @UseGuards(IsOwnerGuard)
  async getMyWallet(@CurrentUser() user: User) {
    return this.walletService.getWalletByUserId(user._id.toString());
  }

  @Get('balance')
  @UseGuards(IsOwnerGuard)
  async getBalance(@CurrentUser() user: User) {
    return await this.walletService.getBalance(user._id.toString());
  }

  @Get('transactions')
  @UseGuards(IsOwnerGuard)
  async getTransactions(
    @CurrentUser() user: User,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    const wallet = await this.walletService.getWalletByUserId(user._id.toString());
    return await this.walletService.getTransactionHistory(wallet._id.toString(), page, limit);
  }

  @Get('user/:userId')
  @UseGuards(RolesGuard)
  @Roles(USER_ROLE.SUPER_ADMIN)
  async getWalletByUserId(@Param('userId') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }

  @Post('fund')
  @UseGuards(IsOwnerGuard)
  async fundWallet(
    @CurrentUser() user: User,
    @Body('amount') amount: number,
  ) {
    return this.walletService.initializeWalletFunding(user._id.toString(), amount);
  }

  @Get('ledger')
  @UseGuards(IsOwnerGuard)
  async getLedger(
    @CurrentUser() user: User,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    const wallet = await this.walletService.getWalletByUserId(user._id.toString());
    return this.walletService.getLedger(wallet._id.toString(), page, limit);
  }

  @Get('session/:sessionId/payment-status')
  @UseGuards(CanViewSessionPaymentsGuard)
  async getSessionPaymentStatus(@Param('sessionId') sessionId: string) {
    return await this.sessionPaymentService.getSessionPaymentStatus(sessionId);
  }

  @Get('session/:sessionId/my-payment')
  async getMySessionPayment(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return await this.sessionPaymentService.getUserSessionPayment(
      sessionId,
      user._id.toString(),
    );
  }

  @Post('session/:sessionId/pay')
  async initializeSessionPayment(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
    @Body() dto: SessionCheckoutDto,
  ) {
    return await this.sessionPaymentService.initializeCheckout(
      sessionId,
      user._id.toString(),
      user.email,
      dto?.amount,
    );
  }

  // Live paid / remaining for a POOL session. Sends the full snapshot on
  // connect (so a reconnect always re-syncs from the DB), then a fresh
  // snapshot whenever the pot changes, plus a 30s heartbeat.
  @Sse('session/:sessionId/payment-stream')
  @UseGuards(CanViewPoolGuard)
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  sessionPaymentStream(@Param('sessionId') sessionId: string): Observable<any> {
    const initial$ = from(this.sessionPaymentService.getPoolSnapshot(sessionId)).pipe(
      map((snapshot) => ({ type: 'pool_snapshot', snapshot, timestamp: Date.now() })),
    );

    const updates$ = this.sessionPaymentEventService
      .getPoolUpdates()
      .pipe(filter((event) => event.snapshot?.sessionId === sessionId));

    // Nest unsubscribes when the client disconnects.
    return merge(initial$, updates$, this.sessionPaymentEventService.getHeartbeat()).pipe(
      map((data) => ({ data })),
    );
  }

  @Post('bank-accounts')
  @UseGuards(IsOwnerGuard)
  async addBankAccount(
    @CurrentUser() user: User,
    @Body() dto: AddBankAccountDto,
  ) {
    return await this.withdrawalService.addBankAccount(
      user._id.toString(),
      dto.accountNumber,
      dto.bankCode,
      dto.bankName,
    );
  }

  @Get('bank-accounts')
  @UseGuards(IsOwnerGuard)
  async getBankAccounts(@CurrentUser() user: User) {
    return await this.withdrawalService.getBankAccounts(user._id.toString());
  }

  @Patch('bank-accounts/:bankAccountId/default')
  @UseGuards(IsOwnerGuard)
  async setDefaultBankAccount(
    @CurrentUser() user: User,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return await this.withdrawalService.setDefaultBankAccount(
      user._id.toString(),
      bankAccountId,
    );
  }

  @Delete('bank-accounts/:bankAccountId')
  @UseGuards(IsOwnerGuard)
  async deleteBankAccount(
    @CurrentUser() user: User,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return await this.withdrawalService.deleteBankAccount(
      user._id.toString(),
      bankAccountId,
    );
  }

  @Post('withdraw')
  @UseGuards(IsOwnerGuard)
  async withdrawFunds(
    @CurrentUser() user: User,
    @Body() dto: WithdrawFundsDto,
  ) {
    return await this.withdrawalService.withdrawFunds(
      user._id.toString(),
      dto.amount,
      dto.bankAccountId,
      dto.reason,
    );
  }
}
