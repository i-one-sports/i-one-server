import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from '@app/common';
import { VotesService } from './votes.service';
import { CastVoteDto } from './dto/votes.dto';

@Controller('votes')
@UseGuards(JwtAuthGuard)
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Get(':sessionId')
  async view(@Param('sessionId') sessionId: string, @CurrentUser() user: any) {
    return this.votesService.view(sessionId, this.userId(user));
  }

  @Post(':sessionId')
  async vote(@Param('sessionId') sessionId: string, @Body() data: CastVoteDto, @CurrentUser() user: any) {
    return this.votesService.vote(sessionId, this.userId(user), data.candidateId);
  }

  private userId(user: any): string {
    return user?._id?.toString() || user?.id?.toString();
  }
}
