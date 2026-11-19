import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformCommission } from '@app/common/schemas/platform-commission.schema';

@Injectable()
export class PlatformCommissionRepository extends AbstractRepository<PlatformCommission> {
  protected readonly logger = new Logger(PlatformCommissionRepository.name);

  constructor(@InjectModel(PlatformCommission.name) model: Model<PlatformCommission>) {
    super(model);
  }
}
