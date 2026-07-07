import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from '@app/common/schemas/wallet.schema';
import { Transaction, TransactionSchema } from '@app/common/schemas/transaction.schema';
import { DedicatedVirtualAccount, DvaSchema } from '@app/common/schemas/dva.schema';
import { LedgerEntry, LedgerEntrySchema } from '@app/common/schemas/ledger-entry.schema';
import { WebhookEvent, WebhookEventSchema } from '@app/common/schemas/webhook-event.schema';
import { SessionPayment, SessionPaymentSchema } from '@app/common/schemas/session-payment.schema';
import { BankAccount, BankAccountSchema } from '@app/common/schemas/bank-account.schema';
import { Session, SessionSchema } from '@app/common/schemas/session.schema';
import { Set, SetSchema } from '@app/common/schemas/sets.schema';

import { WalletRepository } from './repositories/wallet.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { DvaRepository } from './repositories/dva.repository';
import { LedgerRepository } from './repositories/ledger.repository';
import { WebhookEventRepository } from './repositories/webhook-event.repository';
import { SessionPaymentRepository } from './repositories/session-payment.repository';
import { BankAccountRepository } from './repositories/bank-account.repository';

import { WalletService } from './services/wallet.service';
import { SessionPaymentService } from './services/session-payment.service';
import { WebhookService } from './services/webhook.service';
import { WithdrawalService } from './services/withdrawal.service';
import { LocationBillingService } from './services/location-billing.service';

import { WalletController } from './controllers/wallet.controller';
import { WebhookController } from './controllers/webhook.controller';
import { AdminBillingController } from './controllers/admin-billing.controller';
import { LocationBillingController } from './controllers/location-billing.controller';

import { PaystackService } from '@app/common/providers/paystack.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: DedicatedVirtualAccount.name, schema: DvaSchema },
      { name: LedgerEntry.name, schema: LedgerEntrySchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: SessionPayment.name, schema: SessionPaymentSchema },
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Set.name, schema: SetSchema },
    ]),
  ],
  controllers: [
    WalletController,
    WebhookController,
    AdminBillingController,
    LocationBillingController,
  ],
  providers: [
    WalletRepository,
    TransactionRepository,
    DvaRepository,
    LedgerRepository,
    WebhookEventRepository,
    SessionPaymentRepository,
    BankAccountRepository,
    WalletService,
    SessionPaymentService,
    WebhookService,
    WithdrawalService,
    LocationBillingService,
    PaystackService,
  ],
  exports: [
    WalletService,
    SessionPaymentService,
    WithdrawalService,
  ],
})
export class BillingModule {}
