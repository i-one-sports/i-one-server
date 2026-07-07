import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TournamentPayment } from '@app/common/schemas/tournament-payment.schema';

@Injectable()
export class TournamentPaymentRepository extends AbstractRepository<TournamentPayment> {
  protected readonly logger = new Logger(TournamentPaymentRepository.name);

  constructor(@InjectModel(TournamentPayment.name) model: Model<TournamentPayment>) {
    super(model);
  }
}
