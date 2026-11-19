import { Session, SessionSchema, Set, SetSchema } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SetsController } from './sets.controller';
import { SetsService } from './sets.service';
import { SetRepository } from './sets.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Set.name, schema: SetSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
  ],
  controllers: [SetsController],
  providers: [SetRepository, SetsService, SessionRepository],
  exports: [SetsService],
})
export class SetsModule {}
