import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { UploadVerificationDocumentDto } from './dto/verification.dto';
import { VerificationRepository } from './verification.repository';
import { Types } from 'mongoose';
import { Verification } from '@app/common/schemas/verification.schema';
import { WalletService } from '../billing/services/wallet.service';
import { UserRepository } from '../users/users.repository';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly verificationRepository: VerificationRepository,
    private readonly walletService: WalletService,
    private readonly userRepository: UserRepository,
  ) {}

  async submitVerification(
    userId: string,
    data: UploadVerificationDocumentDto,
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

    const updatedVerification = await this.verificationRepository.findOneAndUpdate(
      {
        _id: new Types.ObjectId(verificationId),
        status: { $ne: 'APPROVED' }
      },
      { status: 'APPROVED' }
    );

    if (!updatedVerification) {
      const verification = await this.verificationRepository.findOne({
        _id: new Types.ObjectId(verificationId)
      });

      if (!verification) {
        throw new NotFoundException('Verification not found');
      }

      throw new BadRequestException('Verification is already approved');
    }

    try {
      const user = await this.userRepository.findOne({ _id: updatedVerification.userId });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const { wallet, dva } = await this.walletService.createWalletWithDVA(
        updatedVerification.userId,
        user.email,
        user.firstName,
        user.lastName,
        user.phoneNumber,
      );

      await this.userRepository.findOneAndUpdate(
        { _id: updatedVerification.userId },
        {
          isOwner: true,
          walletId: wallet._id,
        }
      );

      this.logger.log(`Wallet and DVA created for user: ${updatedVerification.userId}`);

      return {
        message: 'Verification approved and wallet created successfully',
        verification: updatedVerification,
        wallet,
        dva: {
          accountNumber: dva.accountNumber,
          bankName: dva.bankName,
          accountName: dva.accountName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create wallet and DVA: ${error.message}`);
      throw new InternalServerErrorException('Verification approved but wallet creation failed');
    }
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

    return {
      message: 'Verification rejected successfully',
      verification: updatedVerification
    };
  }
}
