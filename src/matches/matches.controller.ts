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
import { filter, map, catchError, retry, repeat, startWith, mergeMap, delay, timer, of, tap } from 'rxjs';
import { MatchScoreUpdateEvent } from '@app/common';

@Controller('matches')
// @UseGuards(JwtAuthGuard)
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
  matchScoreStream(@Param('matchId') matchId: string, @Res({ passthrough: true }) response: Response) {
    // Check connection limit
    if (!this.matchEventService.canConnect(matchId)) {
      throw new HttpException(
        `Too many connections for match ${matchId}. Maximum ${500} connections allowed.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Add connection tracking
    this.matchEventService.addConnection(matchId);
    this.logger.log(`New SSE connection for match ${matchId}`);

    // Cleanup on disconnect
    response.on('close', () => {
      this.matchEventService.removeConnection(matchId);
      this.logger.log(`SSE connection closed for match ${matchId}`);
    });

    response.on('error', (error) => {
      this.matchEventService.removeConnection(matchId);
      this.logger.error(`SSE connection error for match ${matchId}:`, error);
    });

    return this.matchEventService.getScoreUpdates().pipe(
      startWith({ type: 'connected', message: 'Connection established', matchId }),
      map(update => ({ data: update })),
      filter(
        (envelope: any) => {
          const update = envelope.data;
          return update.type === 'connected' || 
                 update.type === 'heartbeat' || 
                 (update.matchId && update.matchId.toString() === matchId);
        }
      ),
      catchError((error) => {
        this.logger.error(`SSE Stream error for match ${matchId}:`, error);
        return of({
          data: {
            type: 'error',
            message: 'Connection error, retrying...',
            timestamp: Date.now(),
            matchId
          }
        });
      }),
      retry({
        count: 3,
        delay: (error, retryCount) => {
          this.logger.warn(`SSE retry ${retryCount} for match ${matchId}:`, error.message);
          return timer(1000 * retryCount); // Exponential backoff: 1s, 2s, 3s
        }
      }),
      repeat({
        delay: () => {
          this.logger.log(`SSE stream restarting for match ${matchId}`);
          return timer(1000);
        }
      })
    );
  }

  @Sse('stream')
  streamAllMatches(@Res({ passthrough: true }) response: Response) {
    this.logger.log('New global SSE connection established');

    // Cleanup logging on disconnect
    response.on('close', () => {
      this.logger.log('Global SSE connection closed');
    });

    response.on('error', (error) => {
      this.logger.error('Global SSE connection error:', error);
    });

    return this.matchEventService.getScoreUpdates().pipe(
      startWith({ type: 'connected', message: 'Global stream connected' }),
      map(update => ({ data: update })),
      catchError((error) => {
        this.logger.error('Global SSE Stream error:', error);
        return of({
          data: {
            type: 'error',
            message: 'Global stream error, retrying...',
            timestamp: Date.now(),
            stream: 'global'
          }
        });
      }),
      retry({
        count: 3,
        delay: (error, retryCount) => {
          this.logger.warn(`Global SSE retry ${retryCount}:`, error.message);
          return timer(2000 * retryCount); // Exponential backoff: 2s, 4s, 6s
        }
      }),
      repeat({
        delay: () => {
          this.logger.log('Global SSE stream restarting');
          return timer(2000);
        }
      })
    );
  }
}
