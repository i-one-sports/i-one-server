import { AbstractRepository } from '@app/common';
import { Captain } from '@app/common/schemas/captains.schema';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

Injectable();
export class CaptainRepository extends AbstractRepository<Captain> {
  protected readonly logger = new Logger(CaptainRepository.name);

  constructor(@InjectModel(Captain.name) CaptainModel: Model<Captain>) {
    super(CaptainModel);
  }
}
