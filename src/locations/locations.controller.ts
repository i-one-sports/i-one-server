import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { LocationsService } from './locations.service';
import { CreateLocationDto, ViewNearbyLocationsDto } from './dto/location.dto';
import { CurrentUser, IsOwner, UploadType, User, IsOwnerGuard } from '@app/common';
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


    @UseGuards(IsOwnerGuard)
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
    
    @UseGuards(IsOwnerGuard)
    @Post('register')
    async registerLocation(
      @IsOwner() user: User,
      @Body() data: CreateLocationDto,
    ) {
      return this.locationsService.registerLocation(data, user._id.toString());
    }

  @UseGuards(IsOwnerGuard)  
  @Get('matches/:locationId')
  async getMatchesInLocation(
    @IsOwner() user: User,
    @Param('locationId') locationId: string
  ) {
    return this.locationsService.findMatchesByLocation(locationId);
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

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard')
    async getOwnerDashboard(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
    ) {
      return this.locationsService.getOwnerDashboard(locationId, user._id.toString());
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/summary')
    async getOwnerSummary(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
    ) {
      return this.locationsService.getOwnerSummary(locationId, user._id.toString());
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/last-matches')
    async getOwnerLastMatches(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Query('limit') limit: number = 5,
      @Query('skip') skip: number = 0,
    ) {
      return this.locationsService.getOwnerLastMatches(locationId, user._id.toString(), Number(limit), Number(skip));
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/visitors')
    async getVisitorCount(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
    ) {
      return this.locationsService.getVisitorCount(locationId, user._id.toString());
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/upcoming-sessions')
    async getUpcomingSessions(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Query('limit') limit: number = 20,
      @Query('skip') skip: number = 0,
    ) {
      return this.locationsService.getUpcomingSessions(locationId, user._id.toString(), Number(limit), Number(skip));
    }

    
  }
