import { CustomHttpException } from '@app/common';
import { th } from '@faker-js/faker/.';
import { HttpStatus } from '@nestjs/common';

export const handleError = (error: any, message: string) => {
  if (error instanceof CustomHttpException) {
    throw error;
  }
  console.error('Unhandled service error:', error);

  throw new CustomHttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
};
