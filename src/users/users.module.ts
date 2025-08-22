import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRepository } from './users.repository';
import { MailerService, User, UserSchema } from '@app/common';
import { AuthService } from '../auth/auth.service';
import { UserLocalStrategy } from '../auth/strategy/local.strategy';
import { UsersJwtStrategy } from '../auth/strategy/jwt.strategy';
import { JwtService } from '@nestjs/jwt';
import { StatsService } from 'src/stats/stats.service';
import { StatsModule } from 'src/stats/stats.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
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
      ],
  exports: [UsersService],
})
export class UsersModule {}
