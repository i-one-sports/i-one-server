import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  Sse,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { MatchesService } from './matches.service';
import { MatchEventService } from './match-event.service';
import {
  filter,
  map,
  catchError,
  startWith,
  merge,
  of,
  finalize
} from 'rxjs';
import { MatchScoreUpdateEvent, CurrentUser } from '@app/common';
import { RecordGoalScorerDto } from './dto/match.dto';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  private readonly logger = new Logger(MatchesController.name);

  constructor(
    private matchesService: MatchesService,
    private matchEventService: MatchEventService,
  ) {
    this.logger.log('MatchesController initialized');
  }

  @Post('matchup/:sessionId')
  async matchUp(@Param('sessionId') sessionId: string) {
    return this.matchesService.matchUp(sessionId);
  }

  @Get('matchups/:sessionId')
  async viewSessionMatchUps(@Param('sessionId') sessionId: string) {
    return this.matchesService.viewSessionMatchUps(sessionId);
  }

  @Post('start/:matchId')
  async startMatchInSession(@Param('matchId') matchId: string, @CurrentUser() user: any) {
    const userId = user?._id?.toString() || user?.id?.toString();
    return this.matchesService.startMatch(matchId, userId);
  }

  @Get('details/:matchId')
  async viewMatchDetails(@Param('matchId') matchId: string) {
    return this.matchesService.viewMatchDetails(matchId);
  }



  @Post('goal-scorer/:matchId')
  async recordGoalScorer(
    @Param('matchId') matchId: string,
    @Body() data: RecordGoalScorerDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    return this.matchesService.recordGoalScorer(matchId, data.playerId, data.team, userId);
  }

  @Post('end/:matchId')
  async endMatchInSession(@Param('matchId') matchId: string, @CurrentUser() user: any) {
    const userId = user?._id?.toString() || user?.id?.toString();
    return this.matchesService.endMatch(matchId, userId);
  }

  @Put('increment-score/:matchId')
  async incrementMatchScore(
    @Param('matchId') matchId: string,
    @Query('team') team: 'teamOne' | 'teamTwo',
    @CurrentUser() user: any,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    return this.matchesService.incrementMatchScore(matchId, team, userId);
  }

  @Put('decrement-score/:matchId')
  async decrementMatchScore(
    @Param('matchId') matchId: string,
    @Query('team') team: 'teamOne' | 'teamTwo',
    @CurrentUser() user: any,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    return this.matchesService.decrementMatchScore(matchId, team, userId);
  }

  @Sse('stream/:matchId')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  matchScoreStream(
    @Param('matchId') matchId: string,
    @CurrentUser() user: any,
    @Req() request: Request,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();

    if (!userId) {
      throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
    }

    const connectionCheck = this.matchEventService.canConnect(userId, 'match', matchId);
    if (!connectionCheck.allowed) {
      throw new HttpException(connectionCheck.reason || 'Connection not allowed', HttpStatus.TOO_MANY_REQUESTS);
    }

    const connectionId = this.matchEventService.addConnection(userId, 'match', { matchId });
    this.logger.log(`SSE connection established: ${connectionId} (User: ${userId}, Match: ${matchId})`);

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(connectionId);
        this.logger.log(`SSE connection cleaned up: ${connectionId}`);
      }
    };

    request.on('close', performCleanup);

    return merge(
      this.matchEventService.getScoreUpdates().pipe(
        filter((update: any) => update.matchId && update.matchId.toString() === matchId),
      ),
      this.matchEventService.getHeartbeat(),
    ).pipe(
      startWith({ type: 'connected', message: 'Connection established', matchId, userId, timestamp: Date.now() }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`SSE Stream error for ${connectionId}:`, error.message);
        return of({ data: { type: 'error', message: 'Connection error occurred', timestamp: Date.now(), matchId } });
      }),
      finalize(() => performCleanup()),
    );
  }

  @Sse('stream/session/:sessionId')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  sessionMatchesStream(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: any,
    @Req() request: Request,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();

    if (!userId) {
      throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
    }

    const connectionCheck = this.matchEventService.canConnect(userId, 'session', sessionId);
    if (!connectionCheck.allowed) {
      throw new HttpException(connectionCheck.reason || 'Connection not allowed', HttpStatus.TOO_MANY_REQUESTS);
    }

    const connectionId = this.matchEventService.addConnection(userId, 'session', { sessionId });
    this.logger.log(`Session SSE connection established: ${connectionId} (User: ${userId}, Session: ${sessionId})`);

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(connectionId);
        this.logger.log(`Session SSE connection cleaned up: ${connectionId}`);
      }
    };

    request.on('close', performCleanup);

    return merge(
      this.matchEventService.getScoreUpdates().pipe(
        filter((update: any) => update.sessionId && update.sessionId.toString() === sessionId),
      ),
      this.matchEventService.getHeartbeat(),
    ).pipe(
      startWith({ type: 'connected', message: 'Session stream connected', sessionId, userId, timestamp: Date.now() }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`Session SSE Stream error for ${connectionId}:`, error.message);
        return of({ data: { type: 'error', message: 'Session stream error occurred', timestamp: Date.now(), sessionId } });
      }),
      finalize(() => performCleanup()),
    );
  }

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  streamAllMatches(
    @CurrentUser() user: any,
    @Req() request: Request,
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();

    if (!userId) {
      throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
    }

    const connectionCheck = this.matchEventService.canConnect(userId, 'global');
    if (!connectionCheck.allowed) {
      throw new HttpException(connectionCheck.reason || 'Connection not allowed', HttpStatus.TOO_MANY_REQUESTS);
    }

    const connectionId = this.matchEventService.addConnection(userId, 'global');
    this.logger.log(`Global SSE connection established: ${connectionId} (User: ${userId})`);

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(connectionId);
        this.logger.log(`Global SSE connection cleaned up: ${connectionId}`);
      }
    };

    request.on('close', performCleanup);

    return merge(
      this.matchEventService.getScoreUpdates(),
      this.matchEventService.getHeartbeat(),
    ).pipe(
      startWith({ type: 'connected', message: 'Global stream connected', userId, timestamp: Date.now() }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`Global SSE Stream error for ${connectionId}:`, error.message);
        return of({ data: { type: 'error', message: 'Global stream error occurred', timestamp: Date.now(), stream: 'global' } });
      }),
      finalize(() => performCleanup()),
    );
  }

  @Get('connections/stats')
  getConnectionStats() {
    return this.matchEventService.getConnectionStats();
  }
}
