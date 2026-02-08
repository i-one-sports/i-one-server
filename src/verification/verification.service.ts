import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { UploadVerificationDocumentDto } from './dto/verification.dto';
import { VerificationRepository } from './verification.repository';
import { Types } from 'mongoose';
import { Verification } from '@app/common/schemas/verification.schema';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly verificationRepository: VerificationRepository) {}

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
      backUrl
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

  async getAllVerifications() {
    this.logger.log('Fetching all verifications');
    return this.verificationRepository.find({});
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

    return {
      message: 'Verification approved successfully',
      verification: updatedVerification
    };
  }

  async rejectVerification(verificationId: string) {
    this.logger.log(`Rejecting verification: ${verificationId}`);

    const updatedVerification = await this.verificationRepository.findOneAndUpdate(
      { 
        _id: new Types.ObjectId(verificationId),
        status: { $ne: 'REJECTED' }
      },
      { status: 'REJECTED' }
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
