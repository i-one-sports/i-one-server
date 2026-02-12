import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { VerificationRepository } from './verification.repository';
import { Verification, VerificationSchema } from '@app/common/schemas/verification.schema';
import { AwsService } from '@app/common/providers/aws.service';
import { BillingModule } from '../billing/billing.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Verification.name, schema: VerificationSchema }]),
    BillingModule,
    UsersModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationRepository, AwsService]
})
export class VerificationModule {}
