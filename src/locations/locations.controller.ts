import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationPricingDto, UpdateMonthlyPassSalesDto, UpdateOpeningHoursDto, UpdatePitchConditionDto, ViewNearbyLocationsDto } from './dto/location.dto';
import { CurrentUser, IsOwner, UploadType, User, IsOwnerGuard } from '@app/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer'
import { AwsService } from '@app/common/providers/aws.service';
import { GuestReadable } from 'src/auth/decorators/guest-readable.decorator';
import { toGuestPitch } from 'src/guest/guest-views';

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
      @Param('locationId') locationId: string,
      @IsOwner() user: User,
    ) {
      if (!file) {
        throw new BadRequestException('Pitch photo file is required');
      }

      await this.locationsService.verifyLocationOwner(
        locationId,
        user._id.toString(),
      );

      const pitchUrl = await this.awsService.upload(
        file,
        UploadType.PITCH,
        locationId
      );

      if (!pitchUrl) {
        throw new BadGatewayException('Pitch photo upload failed');
      }

      await this.locationsService.updatePitchPhoto(
        locationId,
        user._id.toString(),
        pitchUrl,
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
      return this.locationsService.registerLocation(data, user._id);
    }

  @UseGuards(IsOwnerGuard)  
  @Get('matches/:locationId')
  async getMatchesInLocation(
    @IsOwner() user: User,
    @Param('locationId') locationId: string
  ) {
    return this.locationsService.findMatchesByLocation(locationId);
  }
    
    @GuestReadable()
    @Get('nearby')
    async getNearbyLocations(
      @Query('lng') lng: number,
      @Query('lat') lat: number,
      @CurrentUser() user: User | undefined,
    ) {
      const pitches = await this.locationsService.viewNearbyLocations(lng, lat);
      return user ? pitches : pitches.map(toGuestPitch);
    }

    @Get('search')
    async searchLocationsByName(@Query('name') name: string) {
      return this.locationsService.searchLocationsByName(name);
    }
    
    @Get()
    async getMyLocation(@CurrentUser() user: User) {
      return this.locationsService.getMyLocation(user._id);
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
      @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
      @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    ) {
      return this.locationsService.getOwnerLastMatches(locationId, user._id.toString(), limit, skip);
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
      @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
      @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    ) {
      return this.locationsService.getUpcomingSessions(locationId, user._id.toString(), limit, skip);
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/revenue')
    async getRevenue(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
    ) {
      return this.locationsService.getRevenue(locationId, user._id.toString());
    }

    @UseGuards(IsOwnerGuard)
    @Get(':locationId/dashboard/users-chart')
    async getUsersChart(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
    ) {
      return this.locationsService.getUsersChart(locationId, user._id.toString());
    }

    @UseGuards(IsOwnerGuard)
    @Patch(':locationId/pitch-condition')
    async updatePitchCondition(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Body() data: UpdatePitchConditionDto,
    ) {
      return this.locationsService.updatePitchCondition(locationId, user._id.toString(), data);
    }

    @UseGuards(IsOwnerGuard)
    @Patch(':locationId/pricing-options')
    async updateLocationPricing(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Body() data: UpdateLocationPricingDto,
    ) {
      return this.locationsService.updateLocationPricing(locationId, user._id.toString(), data);
    }

    // Pause / resume selling and renewing monthly passes at this pitch.
    @UseGuards(IsOwnerGuard)
    @Patch(':locationId/monthly-pass-sales')
    async setMonthlyPassSales(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Body() data: UpdateMonthlyPassSalesDto,
    ) {
      return this.locationsService.setMonthlyPassSalesPaused(locationId, user._id.toString(), data.paused);
    }

    @UseGuards(IsOwnerGuard)
    @Patch(':locationId/opening-hours')
    async updateOpeningHours(
      @IsOwner() user: User,
      @Param('locationId') locationId: string,
      @Body() data: UpdateOpeningHoursDto,
    ) {
      return this.locationsService.updateOpeningHours(locationId, user._id.toString(), data);
    }

    // Public pitch details (guest mode). Declared last so the fixed paths
    // above ('all', 'nearby', 'search', ...) win over ':locationId'.
    @GuestReadable()
    @Get(':locationId')
    async viewLocation(
      @Param('locationId') locationId: string,
      @CurrentUser() user: User | undefined,
    ) {
      const pitch = await this.locationsService.viewLocation(locationId);
      return user ? pitch : toGuestPitch(pitch);
    }

  }
