import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { SessionsService } from './sessions.service';
import { CurrentUser, User } from '@app/common';
import { createSessionRequest } from './dto/sessions.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get('nearby-sessions')
  async findNearbySessionMatches(
    @Query('lng') lng: number,
    @Query('lat') lat: number,
  ) {
    console.log(lng, lat);
    return this.sessionsService.findNearbySessionMatches(lng, lat);
  }

  @Get('all')
  async viewAllSessions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 6,
  ) {
    return this.sessionsService.viewAllSessions(page, limit);
  }

  @Post('start')
  async startSession(
    @Body() data: { locationId: string },
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.startSession(
      user._id.toString(),
      data.locationId,
    );
  }

  @Post('create/:sessionId')
  async createSession(
    @Param('sessionId') sessionId: string,
    @Body() data: createSessionRequest,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.createSession(
      data,
      user._id.toString(),
      sessionId,
    );
  }

  @Post('join/:sessionId')
  async joinSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.joinSession(user._id.toString(), sessionId);
  }

  @Get('by-location/:locationId')
  async getSessionsByLocationAndDate(
    @Param('locationId') locationId: string,
    @Query('date') date: string,
  ) {
    return this.sessionsService.getSessionsByLocationAndDate(locationId, date);
  }

  @Get(':sessionId')
  async viewSession(@Param('sessionId') sessionId: string) {
    return this.sessionsService.viewSession(sessionId);
  }

  @Get('members/:sessionId')
  async viewSessionMembers(@Param('sessionId') sessionId: string) {
    return this.sessionsService.viewSessionMembers(sessionId);
  }

  @Delete('leave/:sessionId')
  async leaveSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.leaveSession(user._id.toString(), sessionId);
  }

  @Post('end/:sessionId')
  async endSession(@Param('sessionId') sessionId: string) {
    return this.sessionsService.endSession(sessionId);
  }

  @Delete('delete/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    return this.sessionsService.deleteSession(sessionId);
  }

  @Patch('reschedule/:sessionId')
  async rescheduleSession(
    @Param('sessionId') sessionId: string,
    @Body() data: { startTime: Date; timeDuration: number },
  ) {
    return this.sessionsService.recheduleSession(
      sessionId,
      data.startTime,
      data.timeDuration,
    );
  }

  @Patch('matchtype')
  async updateManySession() {
    return await this.sessionsService.updateAllSessions();
  }
}
