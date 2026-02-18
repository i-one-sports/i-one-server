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
    },
    @CurrentUser() user: User,
    @Body() data: UploadVerificationDocumentDto,
  ) {
    const frontFile = files.frontPage?.[0];
    const backFile = files.backPage?.[0];

    if (!frontFile || !backFile) {
      throw new BadRequestException('Both front and back pages are required');
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

    return this.verificationService.submitVerification(
      user._id.toString(),
      data,
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
