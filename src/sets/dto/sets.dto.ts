import { IsMongoId, IsNumber } from 'class-validator';

export class CreateSetDto {
  @IsMongoId()
  sessionid: string;

  @IsNumber()
  setNumber: number;
}


