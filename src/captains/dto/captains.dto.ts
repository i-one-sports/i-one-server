import { IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCaptainDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsMongoId()
  @IsOptional()
  sessionId?: string;

  @IsMongoId()
  @IsOptional()
  teamId?: string;
}
