import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Bank, BankSchema } from '@app/common';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { BankRepository } from './banks.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: Bank.name, schema: BankSchema }])],
  controllers: [BanksController],
  providers: [BanksService, BankRepository],
  exports: [BanksService],
})
export class BanksModule {}
