import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Sse,
  UseGuards,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { MatchesService } from './matches.service';
import { MatchEventService } from './match-event.service';
import { 
  filter, 
  map, 
  catchError, 
  retry, 
  repeat, 
  startWith, 
  mergeMap, 
  merge, 
  timer, 
  of, 
  tap,
  finalize
} from 'rxjs';
import { MatchScoreUpdateEvent, CurrentUser } from '@app/common';

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
  async startMatchInSession(@Param('matchId') matchId: string) {
    return this.matchesService.startMatch(matchId);
  }

  @Get('details/:matchId')
  async viewMatchDetails(@Param('matchId') matchId: string) {
    return this.matchesService.viewMatchDetails(matchId);
  }



  @Post('end/:matchId')
  async endMatchInSession(@Param('matchId') matchId: string) {
    return this.matchesService.endMatch(matchId);
  }

  @Put('increment-score/:matchId')
  async incrementMatchScore(
    @Param('matchId') matchId: string,
    @Query('team') team: 'teamOne' | 'teamTwo',
  ) {
    return this.matchesService.incrementMatchScore(matchId, team);
  }

  @Put('decrement-score/:matchId')
  async decrementMatchScore(
    @Param('matchId') matchId: string,
    @Query('team') team: 'teamOne' | 'teamTwo',
  ) {
    return this.matchesService.decrementMatchScore(matchId, team);
  }

  @Sse('stream/:matchId')
  matchScoreStream(
    @Param('matchId') matchId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    
    if (!userId) {
      throw new HttpException(
        'User authentication required',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Check if user can connect
    const connectionCheck = this.matchEventService.canConnect(userId, matchId);
    if (!connectionCheck.allowed) {
      throw new HttpException(
        connectionCheck.reason || 'Connection not allowed',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Add connection tracking
    const connectionId = this.matchEventService.addConnection(userId, matchId);
    this.logger.log(`SSE connection established: ${connectionId} (User: ${userId}, Match: ${matchId})`);

    // Set proper SSE headers
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(userId, matchId);
        this.logger.log(`SSE connection cleaned up: ${connectionId}`);
      }
    };

    // Cleanup on disconnect
    response.on('close', performCleanup);
    response.on('error', (error) => {
      this.logger.error(`SSE connection error for ${connectionId}:`, error.message);
      performCleanup();
    });

    // Merge score updates with heartbeat
    return merge(
      this.matchEventService.getScoreUpdates().pipe(
        filter((update: any) => 
          update.matchId && update.matchId.toString() === matchId
        )
      ),
      this.matchEventService.getHeartbeat()
    ).pipe(
      startWith({ 
        type: 'connected', 
        message: 'Connection established', 
        matchId,
        userId,
        timestamp: Date.now()
      }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`SSE Stream error for ${connectionId}:`, error.message);
        return of({
          data: {
            type: 'error',
            message: 'Connection error occurred',
            timestamp: Date.now(),
            matchId
          }
        });
      }),
      finalize(() => {
        performCleanup();
      })
    );
  }

  @Sse('stream/session/:sessionId')
  sessionMatchesStream(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    
    if (!userId) {
      throw new HttpException(
        'User authentication required',
        HttpStatus.UNAUTHORIZED
      );
    }

    const streamId = `session-${sessionId}`;
    
    // Check connection limits for session stream
    const connectionCheck = this.matchEventService.canConnect(userId, streamId);
    if (!connectionCheck.allowed) {
      throw new HttpException(
        connectionCheck.reason || 'Connection not allowed',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const connectionId = this.matchEventService.addConnection(userId, streamId);
    this.logger.log(`Session SSE connection established: ${connectionId} (User: ${userId}, Session: ${sessionId})`);

    // Set proper SSE headers
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(userId, streamId);
        this.logger.log(`Session SSE connection cleaned up: ${connectionId}`);
      }
    };

    // Cleanup on disconnect
    response.on('close', performCleanup);
    response.on('error', (error) => {
      this.logger.error(`Session SSE connection error for ${connectionId}:`, error.message);
      performCleanup();
    });

    // Merge session score updates with heartbeat
    return merge(
      this.matchEventService.getScoreUpdates().pipe(
        filter((update: any) => 
          update.sessionId && update.sessionId.toString() === sessionId
        )
      ),
      this.matchEventService.getHeartbeat()
    ).pipe(
      startWith({ 
        type: 'connected', 
        message: 'Session stream connected',
        sessionId,
        userId,
        timestamp: Date.now()
      }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`Session SSE Stream error for ${connectionId}:`, error.message);
        return of({
          data: {
            type: 'error',
            message: 'Session stream error occurred',
            timestamp: Date.now(),
            sessionId
          }
        });
      }),
      finalize(() => {
        performCleanup();
      })
    );
  }

  @Sse('stream')
  streamAllMatches(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = user?._id?.toString() || user?.id?.toString();
    
    if (!userId) {
      throw new HttpException(
        'User authentication required',
        HttpStatus.UNAUTHORIZED
      );
    }

    const pseudoMatchId = 'global-stream';
    
    // Check connection limits for global stream
    const connectionCheck = this.matchEventService.canConnect(userId, pseudoMatchId);
    if (!connectionCheck.allowed) {
      throw new HttpException(
        connectionCheck.reason || 'Connection not allowed',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const connectionId = this.matchEventService.addConnection(userId, pseudoMatchId);
    this.logger.log(`Global SSE connection established: ${connectionId} (User: ${userId})`);

    // Set proper SSE headers
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');

    let cleanupPerformed = false;
    const performCleanup = () => {
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        this.matchEventService.removeConnection(userId, pseudoMatchId);
        this.logger.log(`Global SSE connection cleaned up: ${connectionId}`);
      }
    };

    // Cleanup on disconnect
    response.on('close', performCleanup);
    response.on('error', (error) => {
      this.logger.error(`Global SSE connection error for ${connectionId}:`, error.message);
      performCleanup();
    });

    // Merge all score updates with heartbeat
    return merge(
      this.matchEventService.getScoreUpdates(),
      this.matchEventService.getHeartbeat()
    ).pipe(
      startWith({ 
        type: 'connected', 
        message: 'Global stream connected',
        userId,
        timestamp: Date.now()
      }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error(`Global SSE Stream error for ${connectionId}:`, error.message);
        return of({
          data: {
            type: 'error',
            message: 'Global stream error occurred',
            timestamp: Date.now(),
            stream: 'global'
          }
        });
      }),
      finalize(() => {
        performCleanup();
      })
    );
  }

  @Get('connections/stats')
  getConnectionStats() {
    return this.matchEventService.getConnectionStats();
  }
}
