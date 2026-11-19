import { AbstractRepository } from "@app/common";
import { Stat } from "@app/common/schemas/stats.schema";
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";


@Injectable()
export class StatsRepository extends AbstractRepository<Stat>{
    protected readonly logger = new Logger(StatsRepository.name);

    constructor(@InjectModel(Stat.name) StatModel: Model<Stat>) {
        super(StatModel);
    }
}
