import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AbstractDocument } from "./abstract.schema";
import { Types } from "mongoose";

@Schema({versionKey: false,timestamps: true})
export class Verification extends AbstractDocument {
    @Prop({type:Types.ObjectId, ref: 'User'})
    userId: Types.ObjectId;

    @Prop({type: String, enum: ['BVN', 'NIN', 'DRIVERS_LICENSE', 'PASSPORT']})
    idType: string;

    @Prop({type: String})
    idNumber: string;

    @Prop({type: String})
    address: string;

    @Prop({type: String})
    frontUrl: string;

    @Prop({type: String})
    backUrl: string;

    @Prop({type: [String]})
    locationPictures: string[];

    @Prop({type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING'})
    status: string;

    @Prop({type: String, default: null})
    rejectionReason: string;
}

export const VerificationSchema = SchemaFactory.createForClass(Verification);

VerificationSchema.index({ userId: 1 });
