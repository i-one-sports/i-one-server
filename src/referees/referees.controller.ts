import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from '@app/common';
import { RefereesService } from './referees.service';
import { CaptainDeviceRefereeDto, InviteRefereeDto } from './dto/referees.dto';

@Controller('referees')
@UseGuards(JwtAuthGuard)
export class RefereesController {
  constructor(private readonly refereesService: RefereesService) {}

  @Get('history/:userId')
  async history(@Param('userId') userId: string) {
    return this.refereesService.history(userId);
  }

  @Get(':sessionId')
  async roster(@Param('sessionId') sessionId: string, @CurrentUser() user: any) {
    return this.refereesService.roster(sessionId, this.userId(user));
  }

  @Post(':sessionId/invite')
  async invite(@Param('sessionId') sessionId: string, @Body() data: InviteRefereeDto, @CurrentUser() user: any) {
    return this.refereesService.invite(sessionId, this.userId(user), data.userId);
  }

  @Post(':sessionId/device')
  async addOnCaptainDevice(
    @Param('sessionId') sessionId: string,
    @Body() data: CaptainDeviceRefereeDto,
    @CurrentUser() user: any,
  ) {
    return this.refereesService.addOnCaptainDevice(sessionId, this.userId(user), data.guestName, data.guestPhone);
  }

  @Post(':refereeId/accept')
  async accept(@Param('refereeId') refereeId: string, @CurrentUser() user: any) {
    return this.refereesService.respond(refereeId, this.userId(user), true);
  }

  @Post(':refereeId/decline')
  async decline(@Param('refereeId') refereeId: string, @CurrentUser() user: any) {
    return this.refereesService.respond(refereeId, this.userId(user), false);
  }

  private userId(user: any): string {
    return user?._id?.toString() || user?.id?.toString();
  }
}
