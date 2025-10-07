import { Controller, Get, Param } from '@nestjs/common';
import { CaptainsService } from './captains.service';

@Controller('captains')
export class CaptainsController {
  constructor(private readonly captainsService: CaptainsService) {}

  @Get(':id')
  async getTeamCaptain(@Param('id') id: string) {
    return this.captainsService.getTeamCaptain(id);
  }
}
