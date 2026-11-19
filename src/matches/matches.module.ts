import { Match, MatchSchema, Set, SetSchema, Session, SessionSchema } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchRepository } from 'src/matches/matches.repository';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { SetRepository } from 'src/sets/sets.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { MatchEventService } from './match-event.service';
import { BillingModule } from 'src/billing/billing.module';
import { RotationService } from './rotation.service';
import { MatchRefereeService } from './match-referee.service';
import { RefereesModule } from 'src/referees/referees.module';
import { StatsModule } from 'src/stats/stats.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Set.name, schema: SetSchema },
    ]),
    BillingModule,
    RefereesModule,
    StatsModule,
    NotificationsModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService, MatchRepository, SetRepository, SessionRepository, MatchEventService, RotationService, MatchRefereeService],
  exports: [MatchesService],
})
export class MatchesModule {}
