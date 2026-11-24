import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CustomHttpException, UploadType } from '@app/common';
import { AwsService } from '@app/common/providers/aws.service';
import { UserRepository } from './users.repository';
import { TeamRepository } from 'src/tournaments/teams.repository';
import { TournamentRepository } from 'src/tournaments/tournaments.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { WalletRepository } from 'src/billing/repositories/wallet.repository';
import { TransactionRepository } from 'src/billing/repositories/transaction.repository';
import { WebhookEventRepository } from 'src/billing/repositories/webhook-event.repository';
import { BankAccountRepository } from 'src/billing/repositories/bank-account.repository';
import { NotificationService } from 'src/notifications/notification.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';

// Why a deletion was refused. Sent as `details.code` so the app can branch;
// the message is written to be shown to the user as-is.
export type AccountDeletionBlock =
  | 'IN_SESSION'
  | 'IN_TOURNAMENT'
  | 'ORGANISING_TOURNAMENT'
  | 'WALLET_BALANCE'
  | 'WITHDRAWAL_PENDING'
  | 'PITCH_HAS_BOOKINGS'
  | 'PITCH_HAS_TOURNAMENT';

// A withdrawal is "in flight" until Paystack's transfer webhook for it has
// been processed. Transfers settle in minutes to hours; anything older than
// this is treated as settled, so an old withdrawal from before webhooks were
// stored can't block deletion forever.
const WITHDRAWAL_SETTLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// 1,250,000 kobo → "₦12,500"; 1,250,050 → "₦12,500.50".
export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// In-app account deletion (App Store 5.1.1(v)).
//
// Deletion is refused while the user still has money or commitments open
// (assertCanDelete). Otherwise the account is ANONYMISED, not removed:
// payments, ledger entries, matches and stats point at the user row, so it
// stays with every personal field wiped, the email freed for a new sign-up,
// and sign-in blocked (deletedAt; see UsersJwtStrategy).
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly teams: TeamRepository,
    private readonly tournaments: TournamentRepository,
    private readonly locations: LocationRepository,
    private readonly sessions: SessionRepository,
    private readonly wallets: WalletRepository,
    private readonly transactions: TransactionRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly bankAccounts: BankAccountRepository,
    private readonly aws: AwsService,
    private readonly notifications: NotificationService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async deleteAccount(userId: string): Promise<{ message: string }> {
    const id = new Types.ObjectId(userId);
    const user = await this.users.findOne({ _id: id, deletedAt: null });
    if (!user) throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    const ownedPitches = await this.locations.findOwnedBy(id);
    const wallet = await this.wallets.findOwnerWallet(id);
    // Real membership of an open, not-yet-over session — not user.currentSession,
    // which can point at a game that finished long ago.
    const inSession = (await this.sessions.findCurrentForUser(id, new Date())) !== null;
    await this.assertCanDelete(id, inSession, ownedPitches, wallet);

    // All-or-nothing: if any step fails (or a check made inside a write no
    // longer holds), nothing is changed and the user can simply try again.
    await this.connection.transaction(async (tx) => {
      await this.bankAccounts.deleteForUser(id, tx);

      if (wallet && !(await this.wallets.closeIfEmpty(wallet._id, tx))) {
        throw this.blocked('WALLET_BALANCE', 'Money has just arrived in your wallet. Withdraw it before deleting your account.');
      }

      if (ownedPitches.length) await this.locations.unlistOwnedBy(id, tx);

      const anonymised = await this.users.anonymise(id, await this.anonymisedFields(id), tx);
      if (!anonymised) throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND); // deleted just now by another request
    });

    // Confirmation (Apple: "provide a confirmation when the deletion is
    // complete"), to the real address captured before it was wiped. Never
    // awaited by the response, never fails it.
    if (user.email) {
      void this.notifications.sendEmailBatch({
        type: NOTIFICATION_TYPE.ACCOUNT_DELETED,
        recipients: [{ to: user.email, variables: { firstName: user.firstName || 'there' } }],
      });
    }

    // After the commit: the account is already deleted, so a storage hiccup
    // must not fail the request — it's logged instead.
    const avatarDeleted = await this.aws.deleteByUrl(user.avatar, [UploadType.USER_AVATAR, UploadType.AVATAR]);
    this.logger.log(
      `Account ${userId} deleted (anonymised)` +
        (ownedPitches.length ? `; ${ownedPitches.length} pitch(es) unlisted` : '') +
        (user.avatar && !avatarDeleted ? `; avatar file NOT removed from storage: ${user.avatar}` : ''),
    );
    return { message: 'Account deleted successfully' };
  }

  // Refuses deletion while money or commitments are open. Stops at the first
  // problem so the user gets one clear thing to fix.
  private async assertCanDelete(
    userId: Types.ObjectId,
    inSession: boolean,
    ownedPitches: Array<{ _id: Types.ObjectId; name: string }>,
    wallet: { _id: Types.ObjectId; balance: number } | null,
  ): Promise<void> {
    if (inSession) {
      throw this.blocked('IN_SESSION', 'You must leave your current session before deleting your account');
    }

    const playing = await this.tournaments.findLiveForTeams(await this.teams.findIdsWithPlayer(userId));
    if (playing) {
      throw this.blocked(
        'IN_TOURNAMENT',
        `You are part of an active tournament (${playing.name}). Leave or finish it before deleting your account`,
      );
    }

    const organising = await this.tournaments.findLiveOrganisedBy(userId);
    if (organising) {
      throw this.blocked(
        'ORGANISING_TOURNAMENT',
        `You're running ${organising.name}. Finish or cancel it before deleting your account.`,
      );
    }

    if (wallet && wallet.balance > 0) {
      throw this.blocked(
        'WALLET_BALANCE',
        `You have ${formatNaira(wallet.balance)} in your wallet. Withdraw it before deleting your account.`,
      );
    }

    if (wallet) {
      const pending = await this.unsettledWithdrawal(wallet._id);
      if (pending) {
        throw this.blocked(
          'WITHDRAWAL_PENDING',
          `Your withdrawal of ${formatNaira(pending.amount)} is still being processed. Try again once it has arrived.`,
        );
      }
    }

    const pitchIds = ownedPitches.map((pitch) => pitch._id);
    const pitchName = (locationId: Types.ObjectId) =>
      ownedPitches.find((pitch) => pitch._id.equals(locationId))?.name ?? 'Your pitch';

    const booked = await this.sessions.findActiveAtLocations(pitchIds, new Date());
    if (booked) {
      throw this.blocked(
        'PITCH_HAS_BOOKINGS',
        `${pitchName(booked.location)} has upcoming sessions. Cancel them before deleting your account.`,
      );
    }

    const hosting = await this.tournaments.findLiveAtLocations(pitchIds);
    if (hosting) {
      throw this.blocked(
        'PITCH_HAS_TOURNAMENT',
        `${pitchName(hosting.location)} has a tournament in progress (${hosting.name}). Wait until it has finished before deleting your account.`,
      );
    }
  }

  private async unsettledWithdrawal(walletId: Types.ObjectId) {
    const recent = await this.transactions.findWithdrawalsSince(
      walletId,
      new Date(Date.now() - WITHDRAWAL_SETTLE_WINDOW_MS),
    );
    if (!recent.length) return null;
    const settled = await this.webhookEvents.processedEventIds(recent.map((w) => w.reference));
    return recent.find((w) => !settled.has(w.reference)) ?? null;
  }

  private async anonymisedFields(userId: Types.ObjectId) {
    return {
      $set: {
        firstName: 'Deleted',
        lastName: 'player',
        nickname: 'Deleted player',
        // Frees the real address (unique index) so the person can sign up again.
        email: `deleted-${userId.toString()}@deleted.invalid`,
        // Nobody knows this password, so the account can't be signed into.
        password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        phoneNumber: null,
        address: null,
        dateOfBirth: null,
        avatar: null,
        height: null,
        position: null,
        ownerRole: null,
        fcmToken: null, // push device token
        otp: null,
        otpExpiration: null,
        otpVerified: null,
        newsletterOptIn: false,
        location: { type: 'Point', coordinates: [0, 0] },
        deletedAt: new Date(),
      },
    };
  }

  private blocked(code: AccountDeletionBlock, message: string) {
    return new CustomHttpException(message, HttpStatus.BAD_REQUEST, { code });
  }
}
