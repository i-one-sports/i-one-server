import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { TournamentPaymentRepository } from '../repositories/tournament-payment.repository';
import { WalletService } from './wallet.service';
import { PaystackService } from '@app/common/providers/paystack.service';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';

@Injectable()
export class TournamentPaymentService {
  private readonly logger = new Logger(TournamentPaymentService.name);

  constructor(
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
    private readonly walletService: WalletService,
    private readonly paystackService: PaystackService,
  ) {}

  // Called by TournamentsService.createTeamAndRegister when registrationFee > 0
  async createPendingPayment(
    tournamentId: Types.ObjectId,
    teamId: Types.ObjectId,
    captainId: Types.ObjectId,
    locationId: Types.ObjectId,
    ownerId: Types.ObjectId,
    amount: number,
  ) {
    const reference = `TOURNEY_REG_${tournamentId}_${teamId}_${randomUUID()}`;

    return this.tournamentPaymentRepository.create({
      tournamentId,
      teamId,
      captainId,
      locationId,
      ownerId,
      amount,
      status: PaymentStatus.PENDING,
      reference,
    });
  }

  // Captain calls this to get the Paystack checkout URL
  async initializeCheckout(tournamentId: string, teamId: string, captainEmail: string) {
    const payment = await this.tournamentPaymentRepository.findOne({
      tournamentId: new Types.ObjectId(tournamentId),
      teamId: new Types.ObjectId(teamId),
      status: PaymentStatus.PENDING,
    });

    if (!payment) {
      throw new NotFoundException('No pending registration payment found for this team');
    }

    const result = await this.paystackService.initializeTransaction(
      captainEmail,
      payment.amount,
      payment.reference,
      {
        type: 'TOURNAMENT_REGISTRATION',
        tournamentId,
        teamId,
        walletId: (await this.walletService.getWalletByUserId(payment.ownerId.toString()))._id.toString(),
      },
    );

    return {
      authorizationUrl: result.authorization_url,
      reference: result.reference,
      amount: payment.amount,
    };
  }

  // Called by webhook when charge.success fires for TOURNAMENT_REGISTRATION
  async confirmPayment(reference: string, amount: number) {
    const payment = await this.tournamentPaymentRepository.findOne({
      reference,
      status: PaymentStatus.PENDING,
    });

    if (!payment) {
      this.logger.warn(`Tournament payment not found or already processed: ${reference}`);
      return;
    }

    const ownerWallet = await this.walletService.getWalletByUserId(payment.ownerId.toString());

    const transaction = await this.walletService.creditWallet(
      ownerWallet._id,
      amount,
      TransactionSource.TOURNAMENT_REGISTRATION,
      reference,
      { tournamentId: payment.tournamentId.toString(), teamId: payment.teamId.toString() },
    );

    await this.tournamentPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      { status: PaymentStatus.PAID, transactionId: transaction._id, paidAt: new Date() },
    );

    this.logger.log(`Tournament registration confirmed: team ${payment.teamId}, tournament ${payment.tournamentId}`);
  }

  async getTeamPaymentStatus(tournamentId: string, teamId: string) {
    const payment = await this.tournamentPaymentRepository.findOne({
      tournamentId: new Types.ObjectId(tournamentId),
      teamId: new Types.ObjectId(teamId),
    });

    if (!payment) return null;

    return {
      status: payment.status,
      amount: payment.amount,
      reference: payment.reference,
      paidAt: payment.paidAt,
    };
  }
}
