import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AbstractRepository, LedgerEntry } from '@app/common';

@Injectable()
export class LedgerRepository extends AbstractRepository<LedgerEntry> {
  protected readonly logger = new Logger(LedgerRepository.name);

  constructor(
    @InjectModel(LedgerEntry.name) model: Model<LedgerEntry>,
    @InjectConnection() connection: Connection,
  ) {
    super(model, connection);
  }
}
