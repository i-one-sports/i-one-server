import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser, User } from '@app/common';
import { SetsService } from './sets.service';

@Controller('sets')
@UseGuards(JwtAuthGuard)
export class SetsController {
  constructor(private setsService: SetsService) {}

  @Post('create/:sessionId')
  async createSet(@Param('sessionId') sessionId: string, @CurrentUser() user: User) {
    return await this.setsService.createSetForMember(sessionId, user._id.toString());
  }

  @Get(':sessionId')
  async viewSetForSession(@Param('sessionId') sessionId: string) {
    return await this.setsService.viewSetForSession(sessionId);
  }

  @Get('team/:setId')
  async viewSingleSet(@Param('setId') setId: string) {
    return this.setsService.viewSingleSet(setId);
  }

  @Get()
  async viewAllSets() {
    return this.setsService.viewAllSets();
  }
}
