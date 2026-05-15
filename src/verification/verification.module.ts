import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { VerificationRepository } from './verification.repository';
import { Verification, VerificationSchema } from '@app/common/schemas/verification.schema';
import { AwsService } from '@app/common/providers/aws.service';
import { BillingModule } from '../billing/billing.module';
import { UsersModule } from '../users/users.module';
import { Location, LocationSchema } from '@app/common';
import { LocationRepository } from '../locations/locations.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Verification.name, schema: VerificationSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
    BillingModule,
    UsersModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationRepository, LocationRepository, AwsService]
})
export class VerificationModule {}
