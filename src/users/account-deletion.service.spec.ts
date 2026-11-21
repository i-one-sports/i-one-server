import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Types } from 'mongoose';
import { User } from '@app/common';
import { AccountDeletionService, formatNaira } from './account-deletion.service';
import { UserRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersJwtStrategy } from 'src/auth/strategy/jwt.strategy';
import { TeamRepository } from 'src/tournaments/teams.repository';
import { TournamentRepository } from 'src/tournaments/tournaments.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { WalletRepository } from 'src/billing/repositories/wallet.repository';
import { TransactionRepository } from 'src/billing/repositories/transaction.repository';
import { WebhookEventRepository } from 'src/billing/repositories/webhook-event.repository';
import { BankAccountRepository } from 'src/billing/repositories/bank-account.repository';
import { AwsService } from '@app/common/providers/aws.service';
import { UploadType } from '@app/common';

// Real bcrypt is deliberately slow; under a full parallel test run it can
// blow Jest's 5s timeout. The service only needs *a* hash of random bytes.
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('$2b$10$stubbedhashstubbedhashstubbedhashstubbedhashstubbe') }));

describe('AccountDeletionService', () => {
  const userId = new Types.ObjectId();
  const walletId = new Types.ObjectId();
  const pitchId = new Types.ObjectId();
  const tx = { id: 'tx' };

  const users = { findOne: jest.fn(), anonymise: jest.fn() };
  const teams = { findIdsWithPlayer: jest.fn() };
  const tournaments = { findLiveForTeams: jest.fn(), findLiveOrganisedBy: jest.fn(), findLiveAtLocations: jest.fn() };
  const locations = { findOwnedBy: jest.fn(), unlistOwnedBy: jest.fn() };
  const sessions = { findActiveAtLocations: jest.fn() };
  const wallets = { findOwnerWallet: jest.fn(), closeIfEmpty: jest.fn() };
  const transactions = { findWithdrawalsSince: jest.fn() };
  const webhookEvents = { processedEventIds: jest.fn() };
  const bankAccounts = { deleteForUser: jest.fn() };
  const aws = { deleteByUrl: jest.fn() };
  const connection = { transaction: jest.fn((work: (session: typeof tx) => Promise<void>) => work(tx)) };

  const service = new AccountDeletionService(
    users as unknown as UserRepository,
    teams as unknown as TeamRepository,
    tournaments as unknown as TournamentRepository,
    locations as unknown as LocationRepository,
    sessions as unknown as SessionRepository,
    wallets as unknown as WalletRepository,
    transactions as unknown as TransactionRepository,
    webhookEvents as unknown as WebhookEventRepository,
    bankAccounts as unknown as BankAccountRepository,
    aws as unknown as AwsService,
    connection as unknown as Connection,
  );

  // A player with nothing open and no wallet; each test adds the one thing it checks.
  beforeEach(() => {
    jest.clearAllMocks();
    users.findOne.mockResolvedValue({ _id: userId, currentSession: null, avatar: null });
    users.anonymise.mockResolvedValue(true);
    teams.findIdsWithPlayer.mockResolvedValue([]);
    tournaments.findLiveForTeams.mockResolvedValue(null);
    tournaments.findLiveOrganisedBy.mockResolvedValue(null);
    tournaments.findLiveAtLocations.mockResolvedValue(null);
    locations.findOwnedBy.mockResolvedValue([]);
    sessions.findActiveAtLocations.mockResolvedValue(null);
    wallets.findOwnerWallet.mockResolvedValue(null);
    wallets.closeIfEmpty.mockResolvedValue(true);
    transactions.findWithdrawalsSince.mockResolvedValue([]);
    webhookEvents.processedEventIds.mockResolvedValue(new Set());
  });

  const refusal = async (code: string) => {
    const error = await service.deleteAccount(userId.toString()).then(
      () => null,
      (e: { getStatus: () => number; getResponse: () => { message: string; details?: { code: string } } }) => e,
    );
    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error?.getResponse().details?.code).toBe(code);
    return error?.getResponse().message ?? '';
  };

  it('404s for an unknown or already-deleted account', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.deleteAccount(userId.toString())).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(users.findOne).toHaveBeenCalledWith({ _id: userId, deletedAt: null });
  });

  describe('refuses while something is open (and changes nothing)', () => {
    afterEach(() => {
      expect(connection.transaction).not.toHaveBeenCalled();
      expect(users.anonymise).not.toHaveBeenCalled();
    });

    it('in a session', async () => {
      users.findOne.mockResolvedValue({ _id: userId, currentSession: new Types.ObjectId() });
      expect(await refusal('IN_SESSION')).toBe('You must leave your current session before deleting your account');
    });

    it('on a team in a live tournament', async () => {
      teams.findIdsWithPlayer.mockResolvedValue([new Types.ObjectId()]);
      tournaments.findLiveForTeams.mockResolvedValue({ name: 'Weekend Cup' });
      expect(await refusal('IN_TOURNAMENT')).toContain('Weekend Cup');
    });

    it('organising a live tournament', async () => {
      tournaments.findLiveOrganisedBy.mockResolvedValue({ name: 'Lagos Cup' });
      expect(await refusal('ORGANISING_TOURNAMENT')).toBe("You're running Lagos Cup. Finish or cancel it before deleting your account.");
    });

    it('money in the wallet', async () => {
      wallets.findOwnerWallet.mockResolvedValue({ _id: walletId, balance: 1_250_000 });
      expect(await refusal('WALLET_BALANCE')).toBe('You have ₦12,500 in your wallet. Withdraw it before deleting your account.');
    });

    it('a withdrawal Paystack has not settled yet', async () => {
      wallets.findOwnerWallet.mockResolvedValue({ _id: walletId, balance: 0 });
      transactions.findWithdrawalsSince.mockResolvedValue([
        { reference: 'WITHDRAWAL_done', amount: 100_000 },
        { reference: 'WITHDRAWAL_open', amount: 500_000 },
      ]);
      webhookEvents.processedEventIds.mockResolvedValue(new Set(['WITHDRAWAL_done']));
      expect(await refusal('WITHDRAWAL_PENDING')).toBe(
        'Your withdrawal of ₦5,000 is still being processed. Try again once it has arrived.',
      );
    });

    it('owner: a pitch with an upcoming or ongoing session', async () => {
      locations.findOwnedBy.mockResolvedValue([{ _id: pitchId, name: 'Ikoyi Turf' }]);
      sessions.findActiveAtLocations.mockResolvedValue({ location: pitchId });
      expect(await refusal('PITCH_HAS_BOOKINGS')).toBe('Ikoyi Turf has upcoming sessions. Cancel them before deleting your account.');
      expect(sessions.findActiveAtLocations).toHaveBeenCalledWith([pitchId], expect.any(Date));
    });

    it('owner: a pitch hosting a live tournament', async () => {
      locations.findOwnedBy.mockResolvedValue([{ _id: pitchId, name: 'Ikoyi Turf' }]);
      tournaments.findLiveAtLocations.mockResolvedValue({ name: 'Lagos Cup', location: pitchId });
      expect(await refusal('PITCH_HAS_TOURNAMENT')).toContain('Ikoyi Turf has a tournament in progress (Lagos Cup)');
    });
  });

  it('settled withdrawals do not block', async () => {
    wallets.findOwnerWallet.mockResolvedValue({ _id: walletId, balance: 0 });
    transactions.findWithdrawalsSince.mockResolvedValue([{ reference: 'WITHDRAWAL_done', amount: 100_000 }]);
    webhookEvents.processedEventIds.mockResolvedValue(new Set(['WITHDRAWAL_done']));
    await expect(service.deleteAccount(userId.toString())).resolves.toEqual({ message: 'Account deleted successfully' });
  });

  it('anonymises: wipes personal data, frees the email, removes bank accounts, closes the wallet, unlists pitches', async () => {
    wallets.findOwnerWallet.mockResolvedValue({ _id: walletId, balance: 0 });
    locations.findOwnedBy.mockResolvedValue([{ _id: pitchId, name: 'Ikoyi Turf' }]);

    await expect(service.deleteAccount(userId.toString())).resolves.toEqual({ message: 'Account deleted successfully' });

    expect(bankAccounts.deleteForUser).toHaveBeenCalledWith(userId, tx);
    expect(wallets.closeIfEmpty).toHaveBeenCalledWith(walletId, tx);
    expect(locations.unlistOwnedBy).toHaveBeenCalledWith(userId, tx);

    const [anonymisedId, update, session] = users.anonymise.mock.calls[0];
    expect(anonymisedId).toEqual(userId);
    expect(session).toBe(tx);
    expect(update.$set).toMatchObject({
      firstName: 'Deleted',
      lastName: 'player',
      nickname: 'Deleted player',
      email: `deleted-${userId}@deleted.invalid`,
      phoneNumber: null,
      address: null,
      dateOfBirth: null,
      avatar: null,
      fcmToken: null,
      otp: null,
      deletedAt: expect.any(Date),
    });
    expect(update.$set.password).toMatch(/^\$2[aby]\$/); // a bcrypt hash…
    const [hashedInput] = (jest.requireMock('bcrypt') as { hash: jest.Mock }).hash.mock.calls[0];
    expect(hashedInput).toMatch(/^[0-9a-f]{64}$/); // …of 32 random bytes, not anything the user knows
  });

  it('removes the avatar file from storage after the account is deleted', async () => {
    users.findOne.mockResolvedValue({ _id: userId, currentSession: null, avatar: 'https://cdn.example/users/1/a.png' });
    aws.deleteByUrl.mockResolvedValue(true);
    await service.deleteAccount(userId.toString());
    expect(aws.deleteByUrl).toHaveBeenCalledWith('https://cdn.example/users/1/a.png', [UploadType.USER_AVATAR, UploadType.AVATAR]);
  });

  it('a storage failure does not fail the deletion', async () => {
    users.findOne.mockResolvedValue({ _id: userId, currentSession: null, avatar: 'https://cdn.example/users/1/a.png' });
    aws.deleteByUrl.mockResolvedValue(false);
    await expect(service.deleteAccount(userId.toString())).resolves.toEqual({ message: 'Account deleted successfully' });
  });

  it('a refused deletion never touches storage', async () => {
    users.findOne.mockResolvedValue({ _id: userId, currentSession: new Types.ObjectId(), avatar: 'https://cdn.example/users/1/a.png' });
    await refusal('IN_SESSION');
    expect(aws.deleteByUrl).not.toHaveBeenCalled();
  });

  it('a player with no wallet or pitches: nothing to close or unlist', async () => {
    await service.deleteAccount(userId.toString());
    expect(wallets.closeIfEmpty).not.toHaveBeenCalled();
    expect(locations.unlistOwnedBy).not.toHaveBeenCalled();
    expect(users.anonymise).toHaveBeenCalled();
  });

  describe('re-checked inside the write (rolled back if they changed)', () => {
    it('money arrived after the balance check', async () => {
      wallets.findOwnerWallet.mockResolvedValue({ _id: walletId, balance: 0 });
      wallets.closeIfEmpty.mockResolvedValue(false);
      await refusal('WALLET_BALANCE');
      expect(users.anonymise).not.toHaveBeenCalled();
    });

    it('joined a session after the session check', async () => {
      users.anonymise.mockResolvedValue(false);
      await refusal('IN_SESSION');
    });
  });

  it('formats kobo as naira', () => {
    expect(formatNaira(1_250_000)).toBe('₦12,500');
    expect(formatNaira(1_250_050)).toBe('₦12,500.50');
    expect(formatNaira(99)).toBe('₦0.99');
  });
});

describe('UsersJwtStrategy and deleted accounts', () => {
  const strategyWith = (user: Partial<User>) =>
    new UsersJwtStrategy(
      { get: () => 'secret' } as unknown as ConfigService,
      { getProfile: jest.fn().mockResolvedValue(user) } as unknown as UsersService,
    );

  it('rejects a cookie issued before the account was deleted', async () => {
    await expect(strategyWith({ deletedAt: new Date() }).validate({ userId: 'u1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a normal account', async () => {
    await expect(strategyWith({ deletedAt: null, firstName: 'Ada' }).validate({ userId: 'u1' })).resolves.toMatchObject({
      firstName: 'Ada',
    });
  });
});
