import { UseGuards, applyDecorators } from '@nestjs/common';
import { IsCaptainGuard } from '../guards/is-captain.guard';

export function IsCaptain() {
  return applyDecorators(UseGuards(IsCaptainGuard));
}
