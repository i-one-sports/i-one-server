import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Bank } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class BankRepository extends AbstractRepository<Bank> {
  protected readonly logger = new Logger(Bank.name);

  constructor(@InjectModel(Bank.name) bankModel: Model<Bank>) {
    super(bankModel);
  }
}
