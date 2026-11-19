import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionPayment } from '@app/common/schemas/session-payment.schema';

@Injectable()
export class SessionPaymentRepository extends AbstractRepository<SessionPayment> {
  protected readonly logger = new Logger(SessionPaymentRepository.name);

  constructor(@InjectModel(SessionPayment.name) sessionPaymentModel: Model<SessionPayment>) {
    super(sessionPaymentModel);
  }
}
