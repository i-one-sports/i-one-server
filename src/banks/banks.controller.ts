import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { BanksService } from './banks.service';

@Controller('banks')
@UseGuards(JwtAuthGuard)
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  // Full list of supported banks (cached — see BanksService)
  @Get()
  findAll() {
    return this.banksService.findAll();
  }
}
