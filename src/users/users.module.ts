import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRepository } from './users.repository';
import { MailerService, Team, TeamSchema, Tournament, TournamentSchema, User, UserSchema } from '@app/common';
import { AuthService } from '../auth/auth.service';
import { UserLocalStrategy } from '../auth/strategy/local.strategy';
import { UsersJwtStrategy } from '../auth/strategy/jwt.strategy';
import { JwtService } from '@nestjs/jwt';
import { StatsService } from 'src/stats/stats.service';
import { StatsModule } from 'src/stats/stats.module';
import { AwsService } from '@app/common/providers/aws.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Tournament.name, schema: TournamentSchema },
    ]),
    StatsModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRepository,
    AuthService,
    UserLocalStrategy,
    UsersJwtStrategy,
    JwtService,
    MailerService,
    AwsService,
  ],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
