import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsRepository } from './stats.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { Stat, StatSchema } from '@app/common/schemas/stats.schema';

@Module({
    imports: [MongooseModule.forFeature([{name: Stat.name, schema: StatSchema}])],
  controllers: [StatsController],
  providers: [StatsService, StatsRepository],
  exports: [StatsService, StatsRepository]

})
export class StatsModule {
  
}
