import { Injectable, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { SetsModule } from './sets/sets.module';
import { SessionsModule } from './sessions/sessions.module';
import { MatchesModule } from './matches/matches.module';
import { LocationsModule } from './locations/locations.module';
import { Cron, ScheduleModule } from '@nestjs/schedule';
import { TournamentsModule } from './tournaments/tournaments.module';
import { StatsModule } from './stats/stats.module';
import { CaptainsModule } from './captains/captains.module';
import { LoggingInterceptor } from '@app/common';


@Injectable()
class RootCronService {
  // Run every minute
  @Cron('*/30 * * * * *')
  handleCron() {
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '1d',
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    SetsModule,
    MatchesModule,
    LocationsModule,
    TournamentsModule,
    StatsModule,
    CaptainsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RootCronService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
