import { IsDate, IsDateString, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class createSessionRequest {
  @IsNotEmpty()
  @IsNumber()
  setNumber: number;

  @IsNotEmpty()
  @IsNumber()
  playersPerTeam: number;

  @IsNotEmpty()
  @IsNumber()
  timeDuration: number;

  @IsNotEmpty()
  @IsNumber()
  minsPerSet: number;

  @IsNotEmpty()
  @IsDateString()
  startTime: Date;

 
 @IsString()
  winningDecider: string;
}
