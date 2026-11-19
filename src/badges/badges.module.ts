import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlayerMatchStat, PlayerMatchStatSchema, UserBadge, UserBadgeSchema } from '@app/common';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { BadgesController } from './badges.controller';
import { BadgesService } from './badges.service';
import { UserBadgeRepository } from './user-badge.repository';
import { PlayerMatchStatRepository } from 'src/stats/player-match-stat.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserBadge.name, schema: UserBadgeSchema },
      { name: PlayerMatchStat.name, schema: PlayerMatchStatSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [BadgesController],
  providers: [BadgesService, UserBadgeRepository, PlayerMatchStatRepository],
  exports: [BadgesService],
})
export class BadgesModule {}
