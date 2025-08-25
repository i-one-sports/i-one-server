import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { SetsService } from './sets.service';

@Controller('sets')
@UseGuards(JwtAuthGuard)
export class SetsController {
  constructor(private setsService: SetsService) {}

  @Post('create/:sessionId')
  async createSet(@Param('sessionId') sessionId: string) {
    return await this.setsService.createSet(sessionId);
  }

  @Get(':sessionId')
  async viewSetForSession(@Param('sessionId') sessionId: string) {
    return await this.setsService.viewSetForSession(sessionId);
  }

  @Get(':setId')
  async viewSingleSet(@Param('setId') setId: string) {
    return this.setsService.viewSingleSet(setId);
  }

  @Get('sets')
  async viewAllSets() {
    return this.setsService.viewAllSets();
  }
}
