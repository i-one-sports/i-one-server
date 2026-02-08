import { AbstractRepository } from "@app/common";
import { Verification } from "@app/common/schemas/verification.schema";
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class VerificationRepository  extends AbstractRepository<Verification> {
    protected readonly logger = new Logger(VerificationRepository.name);
    constructor(@InjectModel(Verification.name) private readonly verificationModel: Model<Verification>) {
        super(verificationModel);
    }
}