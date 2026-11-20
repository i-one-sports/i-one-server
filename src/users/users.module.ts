import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRepository } from './users.repository';
import {
  Location,
  LocationSchema,
  Session,
  SessionSchema,
  Transaction,
  TransactionSchema,
  Wallet,
  WalletSchema,
  WebhookEvent,
  WebhookEventSchema,
  Team,
  TeamSchema,
  Tournament,
  TournamentSchema,
  User,
  UserSchema,
} from '@app/common';
import { AuthService } from '../auth/auth.service';
import { UserLocalStrategy } from '../auth/strategy/local.strategy';
import { UsersJwtStrategy } from '../auth/strategy/jwt.strategy';
import { JwtService } from '@nestjs/jwt';
import { StatsService } from 'src/stats/stats.service';
import { StatsModule } from 'src/stats/stats.module';
import { AwsService } from '@app/common/providers/aws.service';
import { LocationRepository } from 'src/locations/locations.repository';
import { BankAccount, BankAccountSchema } from '@app/common/schemas/bank-account.schema';
import { BankAccountRepository } from 'src/billing/repositories/bank-account.repository';
import { PaystackService } from '@app/common/providers/paystack.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AccountDeletionService } from './account-deletion.service';
import { TeamRepository } from 'src/tournaments/teams.repository';
import { TournamentRepository } from 'src/tournaments/tournaments.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { WalletRepository } from 'src/billing/repositories/wallet.repository';
import { TransactionRepository } from 'src/billing/repositories/transaction.repository';
import { WebhookEventRepository } from 'src/billing/repositories/webhook-event.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Tournament.name, schema: TournamentSchema },
      { name: Location.name, schema: LocationSchema },
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
    StatsModule,
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRepository,
    AuthService,
    UserLocalStrategy,
    UsersJwtStrategy,
    JwtService,
    AwsService,
    LocationRepository,
    BankAccountRepository,
    PaystackService,
    AccountDeletionService,
    TeamRepository,
    TournamentRepository,
    SessionRepository,
    WalletRepository,
    TransactionRepository,
    WebhookEventRepository,
  ],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
