import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { VerificationDocumentData } from './dto/verification.dto';
import { VerificationRepository } from './verification.repository';
import { Types } from 'mongoose';
import { Verification } from '@app/common/schemas/verification.schema';
import { WalletService } from '../billing/services/wallet.service';
import { UserRepository } from '../users/users.repository';
import { WithdrawalService } from '../billing/services/withdrawal.service';
import { LocationRepository } from '../locations/locations.repository';
import { LOCATION_STATUS, OWNER_ONBOARDING_STATUS } from '@app/common';
import { Wallet } from '@app/common/schemas/wallet.schema';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly verificationRepository: VerificationRepository,
    private readonly walletService: WalletService,
    private readonly userRepository: UserRepository,
    private readonly withdrawalService: WithdrawalService,
    private readonly locationRepository: LocationRepository,
  ) {}

  async submitVerification(
    userId: string,
    data: VerificationDocumentData,
    frontUrl: string,
    backUrl: string
  ) {
    this.logger.log(`Submitting verification for user: ${userId}, idType: ${data.idType}`);

    const userObjectId = new Types.ObjectId(userId);
    const existingVerification = await this.verificationRepository.findOne({
      userId: userObjectId
    });

    const verificationData = {
      idType: data.idType,
      idNumber: data.idNumber,
      address: data.address,
      frontUrl,
      backUrl,
      locationPictures: data.locationPictures
    };

    if (existingVerification) {
      this.logger.log(`Updating existing verification for user: ${userId}`);
      const verification = await this.verificationRepository.findOneAndUpdate(
        { userId: userObjectId },
        { ...verificationData, status: 'PENDING' }
      );

      await this.markOwnerPendingReview(userObjectId);
      
      return this.formatVerificationResponse(
        'Verification documents updated successfully',
        verification
      );
    }

    this.logger.log(`Creating new verification for user: ${userId}`);
    const verification = await this.verificationRepository.create({
      userId: userObjectId,
      ...verificationData
    });

    await this.markOwnerPendingReview(userObjectId);

    return this.formatVerificationResponse(
      'Verification documents submitted successfully',
      verification
    );
  }

  private formatVerificationResponse(message: string, verification: Verification) {
    return {
      message,
      verification: {
        _id: verification._id,
        userId: verification.userId,
        idType: verification.idType,
        idNumber: verification.idNumber,
        address: verification.address,
        frontUrl: verification.frontUrl,
        backUrl: verification.backUrl,
        locationPictures: verification.locationPictures,
        status: verification.status
      }
    };
  }

  private async markOwnerPendingReview(userId: Types.ObjectId) {
    await this.userRepository.findOneAndUpdate(
      {
        _id: userId,
        ownerOnboardingStatus: {
          $in: [
            OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
            OWNER_ONBOARDING_STATUS.REJECTED,
          ],
        },
      },
      { ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.PENDING_REVIEW },
    );
  }

  async getVerificationByUserId(userId: string) {
    this.logger.log(`Fetching verification for user: ${userId}`);
    return this.verificationRepository.findOne({
      userId: new Types.ObjectId(userId)
    });
  }

  async getAllVerifications(page: number = 1, limit: number = 20) {
    this.logger.log(`Fetching all verifications: page=${page}, limit=${limit}`);
    const skip = (page - 1) * limit;

    const [verifications, total] = await Promise.all([
      this.verificationRepository.findRaw().find({}).skip(skip).limit(limit).lean(),
      this.verificationRepository.findRaw().countDocuments({}),
    ]);

    return {
      verifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveVerification(verificationId: string) {
    this.logger.log(`Approving verification: ${verificationId}`);

    const verification = await this.verificationRepository.findOne({
      _id: new Types.ObjectId(verificationId),
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    if (verification.status === 'APPROVED') {
      throw new BadRequestException('Verification is already approved');
    }

    const user = await this.userRepository.findOne({ _id: verification.userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create (or, on retry, reuse) the wallet and DVA *before* touching the
    // verification/user status. If this fails, nothing below runs, so the
    // verification stays exactly as it was and the admin can safely retry
    // instead of getting stuck on "already approved" with no wallet.
    let wallet: Wallet;
    try {
      wallet = await this.walletService.createWallet(verification.userId);
    } catch (error: any) {
      this.logger.error(`Failed to create wallet: ${error.message}`);
      throw new InternalServerErrorException('Failed to create wallet, verification was not approved. Please retry.');
    }

    const updatedVerification = await this.verificationRepository.findOneAndUpdate(
      {
        _id: new Types.ObjectId(verificationId),
        status: { $ne: 'APPROVED' }
      },
      { status: 'APPROVED' }
    );

    if (!updatedVerification) {
      // Lost a race with a concurrent approval; the wallet/DVA created above
      // is still valid and idempotent, so this isn't wasted work.
      throw new BadRequestException('Verification is already approved');
    }

    await this.userRepository.findOneAndUpdate(
      { _id: verification.userId },
      {
        isOwner: true,
        walletId: wallet._id,
        ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.APPROVED,
      }
    );

    // Best-effort side effects: the verification/user/wallet state above is
    // already correctly committed, so a failure here shouldn't surface as an
    // approval failure. Log it for follow-up instead.
    try {
      await Promise.all([
        this.locationRepository.findRaw().updateMany(
          {
            owner: verification.userId,
            status: LOCATION_STATUS.PENDING_VERIFICATION,
          },
          { $set: { status: LOCATION_STATUS.ACTIVE } },
        ),
        this.withdrawalService.activatePendingBankAccounts(
          verification.userId.toString(),
        ),
      ]);
    } catch (error: any) {
      this.logger.error(
        `Verification approved but location/bank-account activation failed for user ${verification.userId}: ${error.message}`,
      );
    }

    this.logger.log(`Wallet created for user: ${verification.userId}`);

    return {
      message: 'Verification approved and wallet created successfully',
      verification: updatedVerification,
      wallet,
    };
  }

  async rejectVerification(verificationId: string, rejectionReason: string) {
    this.logger.log(`Rejecting verification: ${verificationId}`);

    const updatedVerification = await this.verificationRepository.findOneAndUpdate(
      { 
        _id: new Types.ObjectId(verificationId),
        status: { $ne: 'REJECTED' }
      },
      { status: 'REJECTED', rejectionReason },
     
    );

    if (!updatedVerification) {
      const verification = await this.verificationRepository.findOne({
        _id: new Types.ObjectId(verificationId)
      });
      
      if (!verification) {
        throw new NotFoundException('Verification not found');
      }
      
      throw new BadRequestException('Verification is already rejected');
    }

    await Promise.all([
      this.userRepository.findOneAndUpdate(
        { _id: updatedVerification.userId },
        { ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.REJECTED },
      ),
      this.locationRepository.findRaw().updateMany(
        {
          owner: updatedVerification.userId,
          status: LOCATION_STATUS.PENDING_VERIFICATION,
        },
        { $set: { status: LOCATION_STATUS.REJECTED } },
      ),
    ]);

    return {
      message: 'Verification rejected successfully',
      verification: updatedVerification
    };
  }
}
