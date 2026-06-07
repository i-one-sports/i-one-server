import { Location, LocationSchema, Match, MatchSchema, Set, SetSchema, Session, SessionSchema } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchRepository } from 'src/matches/matches.repository';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { SetRepository } from 'src/sets/sets.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { MatchEventService } from './match-event.service';
import { BillingModule } from 'src/billing/billing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Set.name, schema: SetSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
    BillingModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService, MatchRepository, SetRepository, SessionRepository, LocationRepository, MatchEventService],
  exports: [MatchesService],
})
export class MatchesModule {}
