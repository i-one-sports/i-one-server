import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';

export class RecordGoalScorerDto {
  @IsMongoId()
  @IsNotEmpty()
  playerId: string;

  @IsEnum(['teamOne', 'teamTwo'])
  @IsNotEmpty()
  team: 'teamOne' | 'teamTwo';
}
