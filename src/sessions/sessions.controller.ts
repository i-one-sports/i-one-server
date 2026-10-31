import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { from, merge, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { SessionsService } from './sessions.service';
import { CurrentUser, User } from '@app/common';
import { BroadcastSessionMessageDto, createSessionRequest } from './dto/sessions.dto';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import {
  SessionPaymentEventService,
  SessionSnapshot,
  SessionUpdateEvent,
} from 'src/billing/services/session-payment-event.service';
import { CanViewSessionPaymentsGuard } from 'src/billing/guards/can-view-session-payments.guard';

type SessionStreamMessage =
  | { type: 'session_snapshot'; snapshot: SessionSnapshot; timestamp: number }
  | SessionUpdateEvent
  | { type: 'heartbeat'; timestamp: number };

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private sessionsService: SessionsService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly sessionPaymentEventService: SessionPaymentEventService,
  ) {}

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

  @Get('my-current')
  async getMyCurrentSession(@CurrentUser() user: User) {
    return this.sessionsService.getMyCurrentSession(user._id.toString());
  }

  // Live session screen: who's in and where each member is with paying.
  // The full snapshot on connect (so a reconnect always re-syncs), then a
  // fresh one on every join / leave / payment / refund, plus a 30s heartbeat.
  @Sse(':sessionId/stream')
  @UseGuards(CanViewSessionPaymentsGuard)
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  sessionStream(@Param('sessionId') sessionId: string): Observable<{ data: SessionStreamMessage }> {
    const initial$ = from(this.sessionPaymentService.getSessionSnapshot(sessionId)).pipe(
      map((snapshot): SessionStreamMessage => ({ type: 'session_snapshot', snapshot, timestamp: Date.now() })),
    );

    const updates$ = this.sessionPaymentEventService
      .getSessionUpdates()
      .pipe(filter((event) => event.snapshot?.sessionId === sessionId));

    // Nest unsubscribes when the client disconnects.
    return merge<SessionStreamMessage[]>(initial$, updates$, this.sessionPaymentEventService.getHeartbeat()).pipe(
      map((data) => ({ data })),
    );
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
  async endSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.endSession(sessionId, user._id.toString());
  }

  @Delete('delete/:sessionId')
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.deleteSession(sessionId, user._id.toString());
  }

  @Post('cancel/:sessionId')
  async cancelSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.cancelSession(sessionId, user._id.toString());
  }

  @Patch('reschedule/:sessionId')
  async rescheduleSession(
    @Param('sessionId') sessionId: string,
    @Body() data: { startTime: Date; timeDuration: number },
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.recheduleSession(
      sessionId,
      data.startTime,
      data.timeDuration,
      user._id.toString(),
    );
  }

  @Post('notify/:sessionId')
  async notifySessionMembers(
    @Param('sessionId') sessionId: string,
    @Body() data: BroadcastSessionMessageDto,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.notifySessionMembers(
      sessionId,
      user._id.toString(),
      data.title,
      data.body,
    );
  }
}
