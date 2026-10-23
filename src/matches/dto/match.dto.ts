import { IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';

// Sent with every score change. See "Recording safely on a bad network" in
// API_DOCUMENTATION.md.
export class ScoreChangeDto {
  // Created on the phone once per tap and reused on every retry of that tap.
  @IsString()
  @Length(8, 64)
  eventId: string;

  // The match's scoreVersion as the recorder's screen showed it.
  @IsInt()
  @Min(0)
  expectedScoreVersion: number;
}

export class RecordGoalScorerDto extends ScoreChangeDto {
  @IsMongoId()
  @IsNotEmpty()
  playerId: string;

  @IsEnum(['teamOne', 'teamTwo'])
  @IsNotEmpty()
  team: 'teamOne' | 'teamTwo';

  @IsOptional()
  @IsMongoId()
  assistedBy?: string;
}

export class EndMatchDto {
  // The scoreVersion the recorder saw when they pressed end. If a goal
  // landed after that, ending is refused so they can see it first.
  @IsInt()
  @Min(0)
  expectedScoreVersion: number;

  // Required only when the game is a draw and the session settles draws on penalties.
  @IsOptional()
  @IsEnum(['teamOne', 'teamTwo'])
  penaltyWinner?: 'teamOne' | 'teamTwo';
}
