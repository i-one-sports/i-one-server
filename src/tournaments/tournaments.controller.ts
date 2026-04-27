import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { TournamentsService } from './tournaments.service';
import { CurrentUser, User } from '@app/common';
import {
  CreateTournamentDto,
  CreateTeamAndRegisterDto,
  RecordMatchResultDto,
  ManualAdvanceDto,
  ScheduleMatchDto,
} from './dto/tournament.dto';

@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  // Create a tournament at a location
  @Post('create/:locationId')
  create(
    @Param('locationId') locationId: string,
    @Body() dto: CreateTournamentDto,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.create(dto, locationId, user._id.toString());
  }

  // All tournaments for a location
  @Get('location/:locationId')
  findByLocation(@Param('locationId') locationId: string) {
    return this.tournamentsService.findByLocation(locationId);
  }

  // Full tournament detail (bracket + registered teams)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  // Create a team and register it to the tournament in one step
  @Post(':id/team')
  createTeamAndRegister(
    @Param('id') id: string,
    @Body() dto: CreateTeamAndRegisterDto,
  ) {
    return this.tournamentsService.createTeamAndRegister(id, dto);
  }

  // Unregister a team (registration phase only)
  @Delete(':id/team/:teamId')
  unregisterTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
  ) {
    return this.tournamentsService.unregisterTeam(id, teamId);
  }

  // Start tournament — generates bracket (organizer only)
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tournamentsService.startTournament(id, user._id.toString());
  }

  // Record match result — winner auto-advances (organizer only)
  @Patch(':id/match/:matchIndex/result')
  recordResult(
    @Param('id') id: string,
    @Param('matchIndex', ParseIntPipe) matchIndex: number,
    @Body() dto: RecordMatchResultDto,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.recordResult(id, matchIndex, dto, user._id.toString());
  }

  // Manually pick winner for a match (draws / moderator override)
  @Patch(':id/match/:matchIndex/advance')
  manualAdvance(
    @Param('id') id: string,
    @Param('matchIndex', ParseIntPipe) matchIndex: number,
    @Body() dto: ManualAdvanceDto,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.manualAdvance(id, matchIndex, dto, user._id.toString());
  }

  // Set scheduled time for a bracket match (organizer only)
  @Patch(':id/match/:matchIndex/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @Param('matchIndex', ParseIntPipe) matchIndex: number,
    @Body() dto: ScheduleMatchDto,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.scheduleMatch(id, matchIndex, dto, user._id.toString());
  }
}
