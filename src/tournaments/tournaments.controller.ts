import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { TournamentsService } from './tournaments.service';
import { TournamentEventService } from './tournament-event.service';
import { CurrentUser, User } from '@app/common';
import { catchError, filter, finalize, map, merge, of, startWith } from 'rxjs';
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
  private readonly logger = new Logger(TournamentsController.name);

  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentEventService: TournamentEventService,
  ) {}

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

  // Create a team and register it to the tournament in one step (captain only — registers their own team)
  @Post(':id/team')
  createTeamAndRegister(
    @Param('id') id: string,
    @Body() dto: CreateTeamAndRegisterDto,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.createTeamAndRegister(id, dto, user._id.toString());
  }

  // Unregister a team (registration phase only — team captain or tournament organizer)
  @Delete(':id/team/:teamId')
  unregisterTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.unregisterTeam(id, teamId, user._id.toString());
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

  // Live tournament updates — bracket/fixture/standings changes pushed over SSE
  // (same Redis pub/sub → Subject → SSE pipeline as session match streams)
  @Sse('stream/:id')
  tournamentStream(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();

    if (!userId) {
      throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
    }

    const connectionCheck = this.tournamentEventService.canConnect(id);
    if (!connectionCheck.allowed) {
      throw new HttpException(connectionCheck.reason || 'Connection not allowed', HttpStatus.TOO_MANY_REQUESTS);
    }

    const connectionId = this.tournamentEventService.addConnection(id, userId);
    this.logger.log(`Tournament SSE connection established: ${connectionId} (User: ${userId}, Tournament: ${id})`);

    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.tournamentEventService.removeConnection(id, connectionId);
        this.logger.log(`Tournament SSE connection cleaned up: ${connectionId}`);
      }
    };

    response.on('close', performCleanup);
    response.on('error', (error) => {
      this.logger.error(`Tournament SSE connection error for ${connectionId}:`, error.message);
      performCleanup();
    });

    return merge(
      this.tournamentEventService.getTournamentUpdates().pipe(
        filter((update: any) => update.tournamentId && update.tournamentId.toString() === id),
      ),
      this.tournamentEventService.getHeartbeat(),
    ).pipe(
      startWith({
        type: 'connected',
        message: 'Tournament stream connected',
        tournamentId: id,
        userId,
        timestamp: Date.now(),
      }),
      map((update) => ({ data: update })),
      catchError((error) => {
        this.logger.error(`Tournament SSE stream error for ${connectionId}:`, error.message);
        return of({
          data: {
            type: 'error',
            message: 'Tournament stream error occurred',
            timestamp: Date.now(),
            tournamentId: id,
          },
        });
      }),
      finalize(() => {
        performCleanup();
      }),
    );
  }
}
