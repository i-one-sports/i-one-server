import { IsMongoId, IsNotEmpty } from 'class-validator';

export class CastVoteDto {
  @IsMongoId()
  @IsNotEmpty()
  candidateId: string;
}
