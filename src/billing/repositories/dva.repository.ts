import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DedicatedVirtualAccount } from '@app/common/schemas/dva.schema';

@Injectable()
export class DvaRepository extends AbstractRepository<DedicatedVirtualAccount> {
  protected readonly logger = new Logger(DvaRepository.name);

  constructor(@InjectModel(DedicatedVirtualAccount.name) dvaModel: Model<DedicatedVirtualAccount>) {
    super(dvaModel);
  }
}
