import { Module } from '@nestjs/common';
import { CaptainsService } from './captains.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Captain, CaptainSchema } from '@app/common/schemas/captains.schema';
import { CaptainsController } from './captains.controller';
import { CaptainRepository } from './captains.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Captain.name, schema: CaptainSchema }]),
  ],
  providers: [CaptainsService, CaptainRepository],
  controllers: [CaptainsController],
  exports: [CaptainsService],
})
export class CaptainsModule {}
