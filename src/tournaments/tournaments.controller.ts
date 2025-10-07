import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/tournament.dto';
import { CurrentUser, User } from '@app/common';

@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post('create/:locationId')
  createTournament(
    @Body() data: CreateTournamentDto,
    @Query('locationId') locationId: string,
    @CurrentUser() user: User,
  ) {
    return this.tournamentsService.create(
      data,
      locationId,
      user._id.toString(),
    );
  }
}


