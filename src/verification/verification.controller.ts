import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { VerificationService } from './verification.service';
import {
  CurrentUser,
  User,
  UploadType,
  RolesGuard,
  Roles,
  ROLES_KEY,
  USER_ROLE,
} from '@app/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { AwsService } from '@app/common/providers/aws.service';
import { UploadVerificationDocumentDto } from './dto/verification.dto';

@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(
    private verificationService: VerificationService,
    private readonly awsService: AwsService,
  ) {}

  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'frontPage', maxCount: 1 },
        { name: 'backPage', maxCount: 1 },
        { name: 'locationPictures', maxCount: 5},
      ],
      {
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      },
    ),
  )
  @Post('submit')
  async submitVerificationDocuments(
    @UploadedFiles()
    files: {
      frontPage?: Express.Multer.File[];
      backPage?: Express.Multer.File[];
      locationPictures?: Express.Multer.File[];
    },
    @CurrentUser() user: User,
    @Body() data: UploadVerificationDocumentDto,
  ) {
    const frontFile = files.frontPage?.[0];
    const backFile = files.backPage?.[0];
    const locationFiles = files.locationPictures || [];

    if (!frontFile || !backFile) {
      throw new BadRequestException('Both front and back pages are required');
    }

    if (locationFiles.length === 0) {
      throw new BadRequestException('At least one location picture is required');
    }

    const frontUrl = await this.awsService.upload(
      frontFile,
      UploadType.DOCUMENT_FRONT,
      `${user._id}-${data.idType}`,
    );

    const backUrl = await this.awsService.upload(
      backFile,
      UploadType.DOCUMENT_BACK,
      `${user._id}-${data.idType}`,
    );

    // Upload all location pictures
    const locationPictureUrls = await Promise.all(
      locationFiles.map((file, index) =>
        this.awsService.upload(
          file,
          UploadType.LOCATION_PICTURE,
          `${user._id}-${data.idType}-location-${index}`,
        ),
      ),
    );

    // Override locationPictures in data with uploaded URLs
    const verificationData = {
      ...data,
      locationPictures: locationPictureUrls,
    };

    return this.verificationService.submitVerification(
      user._id.toString(),
      verificationData,
      frontUrl,
      backUrl,
    );
  }

  @Get('me')
  async getMyVerification(@CurrentUser() user: User) {
    return this.verificationService.getVerificationByUserId(
      user._id.toString(),
    );
  }

  @Get('all')
  async getAllVerifications() {
    return this.verificationService.getAllVerifications();
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch(':id/approve')
  async approveVerification(@Param('id') id: string) {
    return this.verificationService.approveVerification(id);
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch(':id/reject')
  async rejectVerification(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string
  ) {
    return this.verificationService.rejectVerification(id, rejectionReason);
  }
}
