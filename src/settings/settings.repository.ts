import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings } from '@app/common/schemas/settings.schema';

@Injectable()
export class SettingsRepository extends AbstractRepository<Settings> {
  protected readonly logger = new Logger(SettingsRepository.name);

  constructor(@InjectModel(Settings.name) settingsModel: Model<Settings>) {
    super(settingsModel);
  }
}
