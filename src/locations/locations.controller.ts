import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { LocationsService } from './locations.service';
import { CreateLocationDto, ViewNearbyLocationsDto } from './dto/location.dto';
import { CurrentUser, IsOwner, UploadType, User } from '@app/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer'
import { AwsService } from '@app/common/providers/aws.service';

@Controller('location')
@UseGuards(JwtAuthGuard)
@UseInterceptors(
  FileInterceptor('file', {
    storage: multer.memoryStorage()
  })
)
export class LocationsController {
  constructor(
    private locationsService: LocationsService,
    private readonly awsService: AwsService) {}


    @Post('pitch/:locationId')
    async uploadPitchPhoto(
      @UploadedFile() file: Express.Multer.File,
      @Param('locationId') locationId: string
    ) {
      const pitchUrl = await this.awsService.upload(
        file,
        UploadType.PITCH,
        locationId
      );
      
      return { pitchPhoto:  pitchUrl};
    }
    @Get('all')
    async viewAllLocations() {
      return this.locationsService.viewAllLocations();
    }
    
    @Post('register')
    async registerLocation(
      @IsOwner() user: User,
      @Body() data: CreateLocationDto,
    ) {
      return this.locationsService.registerLocation(data);
    }
    
    @Get('nearby')
    async getNearbyLocations(
      @Query('lng') lng: number,
      @Query('lat') lat: number,
    ) {
      return this.locationsService.viewNearbyLocations(lng, lat);
    }
    
    @Get()
    async getMyLocation(@CurrentUser() user: User) {
      return this.locationsService.getMyLocation(user._id.toString());
    }
  }
