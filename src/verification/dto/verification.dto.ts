import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export enum VerificationType {
    BVN = 'BVN',
    NIN = 'NIN',
    DRIVERS_LICENSE = 'DRIVERS_LICENSE',
    PASSPORT = 'PASSPORT'
}

export class VerificationDto {
    @IsString()
    @IsNotEmpty()
    @IsEnum(VerificationType, { message: `idType must be one of the following: ${Object.values(VerificationType).join(', ')}` })
    idType: VerificationType;

    @IsString()
    @IsNotEmpty()
    idNumber: string;

    @IsString()
    @IsNotEmpty()
    address: string;
}



export class UploadVerificationDocumentDto extends VerificationDto {}