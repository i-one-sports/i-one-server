import { HttpStatus, Injectable } from '@nestjs/common';
import { TournamentRepository } from './tournaments.repository';
import { TeamRepository } from './teams.repository';
import { UserRepository } from 'src/users/users.repository';
import {
  CreateTournamentDto,
  RegisterTeamDto,
  UpdateMatchResultDto,
  UpdateTournamentDto,
} from './dto/tournament.dto';
import {
  CustomHttpException,
  Group,
  Team,
  Tournament,
  TournamentFormat,
  TournamentMatch,
  TournamentStatus,
} from '@app/common';
import { LocationsService } from 'src/locations/locations.service';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly teamRepository: TeamRepository,
    private readonly locationService: LocationsService,
    private readonly userRepository: UserRepository,
  ) {}

  private generateCode() {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }
    return result;
  }

  async create(
    createTournamentDto: CreateTournamentDto,
    userId: string,
    locationId: string,
  ): Promise<Tournament> {
    const location = await this.locationService.getLocationById(locationId);
    if (!location) {
      throw new CustomHttpException(
        `Location with ID ${locationId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const tournament = await this.tournamentRepository.create({
      ...createTournamentDto,
      registeredTeams: [],
      organizer: userId,
      location: locationId,
      code: this.generateCode(),
      status: TournamentStatus.REGISTRATION,
      endDate: new Date(
        createTournamentDto.startDate.getTime() +
          createTournamentDto.durationDays * 24 * 60 * 60 * 1000,
          
      ),
    });
    return tournament;
  }

  async findOne(id: string): Promise<Tournament> {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(id)
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .populate('location')
      .exec();

    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    return tournament;
  }

  async update(
    id: string,
    updateTournamentDto: UpdateTournamentDto,
  ): Promise<Tournament> {
    const tournament = await this.tournamentRepository.findOne({
      _id: id,
    });

    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

 

    const updatedTournament = await this.tournamentRepository
      .findRaw()
      .findByIdAndUpdate(id, updateTournamentDto, { new: true })
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .exec();

    return updatedTournament;
  }

  async remove(id: string): Promise<void> {
    const result = await this.tournamentRepository
      .findRaw()
      .deleteOne({ _id: id })
      .exec();
    if (result.deletedCount === 0) {
      throw new CustomHttpException(
        `Tournament with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async registerTeam(
    tournamentId: string,
    registerTeamDto: RegisterTeamDto,
  ): Promise<Tournament> {
    const tournament: Tournament = await this.tournamentRepository.findOne({
      _id: tournamentId,
    });
    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${tournamentId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Check if tournament is in registration phase
    if (tournament.status !== TournamentStatus.REGISTRATION) {
      throw new CustomHttpException(
        'Tournament is not in registration phase',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if tournament is full
    if (tournament.registeredTeams.length >= tournament.maxTeams) {
      throw new CustomHttpException(
        'Tournament is full',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate team exists
    const team = await this.teamRepository.findOne({
      _id: registerTeamDto.teamId,
    });
    if (!team) {
      throw new CustomHttpException(
        `Team with ID ${registerTeamDto.teamId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Check if team is already registered
    if (
      tournament.registeredTeams.some(
        (teamId) => teamId.toString() === registerTeamDto.teamId,
      )
    ) {
      throw new CustomHttpException(
        'Team is already registered for this tournament',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.tournamentRepository
      .findRaw()
      .findByIdAndUpdate(tournamentId, {
        $push: { registeredTeams: tournament.registeredTeams },
      })
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .exec();
  }

  async unregisterTeam(
    tournamentId: string,
    teamId: string,
  ): Promise<Tournament> {
    const tournament = await this.tournamentRepository.findOne({
      _id: tournamentId,
    });

    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${tournamentId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Check if tournament is in registration phase
    if (tournament.status !== TournamentStatus.REGISTRATION) {
      throw new CustomHttpException(
        'Tournament is not in registration phase',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if team is registered
    if (
      !tournament.registeredTeams.some(
        (registeredTeamId) => registeredTeamId.toString() === teamId,
      )
    ) {
      throw new CustomHttpException(
        'Team is not registered for this tournament',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Remove team from tournament
    tournament.registeredTeams = tournament.registeredTeams.filter(
      (registeredTeamId) => registeredTeamId.toString() !== teamId,
    );

    return this.tournamentRepository
      .findRaw()
      .findByIdAndUpdate(
        tournamentId,
        { $pull: { registeredTeams: teamId } },
        { new: true },
      )
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .exec();
  }

  // async startTournament(tournamentId: string): Promise<Tournament> {
  //   const tournament = await this.tournamentRepository.findOne({
  //     _id: tournamentId,
  //   });
  //   if (!tournament) {
  //     throw new CustomHttpException(
  //       `Tournament with ID ${tournamentId} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }

  //   if (tournament.status !== TournamentStatus.REGISTRATION) {
  //     throw new CustomHttpException(
  //       'Tournament is not in registration phase',
  //       HttpStatus.BAD_REQUEST,
  //     );
  //   }

  //   if (tournament.format === TournamentFormat.UCL_CLASSIC) {
  //     if (tournament.registeredTeams.length < 16) {
  //       throw new CustomHttpException(
  //         'Tournament needs at least 16 teams to start',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }
  //     if (tournament.registeredTeams.length > 32) {
  //       throw new CustomHttpException(
  //         'Tournament can have at most 32 teams',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }
  //   }

  //   // Populate teams to get country information for seeding
  //   const teamsWithDetails = await this.teamRepository.find({
  //     _id: { $in: tournament.registeredTeams },
  //   });

  //   switch (tournament.format) {
  //     case TournamentFormat.UCL_CLASSIC:
  //       await this.setupUCLClassicFormat(tournament, teamsWithDetails);
  //       break;
  //     default:
  //       throw new CustomHttpException(
  //         `Tournament format ${tournament.format} not supported yet`,
  //         HttpStatus.BAD_REQUEST,
  //       );
  //   }

  //   // Update tournament status
  //   tournament.status = TournamentStatus.GROUP_STAGE;

  //   return this.tournamentRepository
  //     .findRaw()
  //     .findByIdAndUpdate(
  //       tournamentId,
  //       {
  //         status: tournament.status,
  //         groups: tournament.groups,
  //         matches: tournament.matches,
  //       },
  //       { new: true },
  //     )
  //     .populate('organizer', 'username email')
  //     .populate('registeredTeams')
  //     .populate({
  //       path: 'groups.teams',
  //       model: 'Team',
  //     })
  //     .populate({
  //       path: 'matches.homeTeam',
  //       model: 'Team',
  //     })
  //     .populate({
  //       path: 'matches.awayTeam',
  //       model: 'Team',
  //     })
  //     .exec();
  // }

  // private async setupUCLClassicFormat(
  //   tournament: Tournament,
  //   teams: Team[],
  // ): Promise<void> {
  //   // Determine number of groups (up to 8)
  //   const numTeams = teams.length;
  //   const numGroups = Math.min(8, Math.floor(numTeams / 4));
  //   const teamsPerGroup = Math.ceil(numTeams / numGroups);

  //   // Create groups
  //   const groups: Group[] = [];
  //   const groupNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  //   // Shuffle teams to randomly assign to groups
  //   const shuffledTeams = [...teams];
  //   for (let i = shuffledTeams.length - 1; i > 0; i--) {
  //     const j = Math.floor(Math.random() * (i + 1));
  //     [shuffledTeams[i], shuffledTeams[j]] = [
  //       shuffledTeams[j],
  //       shuffledTeams[i],
  //     ];
  //   }

  //   // Assign teams to groups
  //   let teamIndex = 0;
  //   for (let i = 0; i < numGroups; i++) {
  //     const group: Group = {
  //       name: groupNames[i],
  //       teams: [],
  //       standings: [],
  //     };

  //     // Add teams to group
  //     for (
  //       let j = 0;
  //       j < teamsPerGroup && teamIndex < shuffledTeams.length;
  //       j++
  //     ) {
  //       group.teams.push(shuffledTeams[teamIndex]._id.toString());

  //       // Initialize standings for this team
  //       group.standings.push({
  //         team: shuffledTeams[teamIndex]._id.toString(),
  //         played: 0,
  //         won: 0,
  //         drawn: 0,
  //         lost: 0,
  //         goalsFor: 0,
  //         goalsAgainst: 0,
  //         points: 0,
  //       });

  //       teamIndex++;
  //     }

  //     groups.push(group);
  //   }

  //   // Create matches for group stage
  //   const matches: TournamentMatch[] = [];
  //   const now = new Date();

  //   for (const group of groups) {
  //     // Generate round-robin matches for each group
  //     for (let i = 0; i < group.teams.length; i++) {
  //       for (let j = i + 1; j < group.teams.length; j++) {
  //         // Home and away matches
  //         const homeMatch: TournamentMatch = {
  //           homeTeam: group.teams[i],
  //           awayTeam: group.teams[j],
  //           homeScore: null,
  //           awayScore: null,
  //           location:
  //             tournament.locations.length > 0
  //               ? tournament.locations[0]
  //               : {
  //                   name: 'Default Location',
  //                   address: 'TBD',
  //                   city: 'TBD',
  //                   country: 'TBD',
  //                   location: { type: 'Point', coordinates: [0, 0] },
  //                 },
  //           scheduledDate: new Date(
  //             now.getTime() + matches.length * 24 * 60 * 60 * 1000,
  //           ), // 1 day apart
  //           completed: false,
  //           stage: 'group_stage',
  //           group: group.name,
  //         };

  //         const awayMatch: TournamentMatch = {
  //           homeTeam: group.teams[j],
  //           awayTeam: group.teams[i],
  //           homeScore: null,
  //           awayScore: null,
  //           location:
  //             tournament.locations.length > 0
  //               ? tournament.locations[
  //                   Math.min(1, tournament.locations.length - 1)
  //                 ]
  //               : {
  //                   name: 'Default Location',
  //                   address: 'TBD',
  //                   city: 'TBD',
  //                   country: 'TBD',
  //                   location: { type: 'Point', coordinates: [0, 0] },
  //                 },
  //           scheduledDate: new Date(
  //             now.getTime() + (matches.length + 1) * 24 * 60 * 60 * 1000,
  //           ), // 1 day apart
  //           completed: false,
  //           stage: 'group_stage',
  //           group: group.name,
  //         };

  //         matches.push(homeMatch, awayMatch);
  //       }
  //     }
  //   }

  //   // Assign groups and matches to tournament
  //   tournament.groups = groups;
  //   tournament.matches = matches;
  // }

  // async updateMatchResult(
  //   tournamentId: string,
  //   matchIndex: number,
  //   updateMatchResultDto: UpdateMatchResultDto,
  // ): Promise<Tournament> {
  //   const tournament = await this.tournamentRepository.findOne({
  //     _id: tournamentId,
  //   });
  //   if (!tournament) {
  //     throw new CustomHttpException(
  //       `Tournament with ID ${tournamentId} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }

  //   // Check if match exists
  //   if (matchIndex < 0 || matchIndex >= tournament.matches.length) {
  //     throw new CustomHttpException(
  //       `Match index ${matchIndex} not found in tournament`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }

  //   const match = tournament.matches[matchIndex];

  //   // Check if match already completed
  //   if (match.completed) {
  //     throw new CustomHttpException(
  //       'Match is already completed',
  //       HttpStatus.BAD_REQUEST,
  //     );
  //   }

  //   // Update match result
  //   match.homeScore = updateMatchResultDto.homeScore;
  //   match.awayScore = updateMatchResultDto.awayScore;
  //   match.completed = true;
  //   tournament.matches[matchIndex] = match;

  //   // If this is a group stage match, update the group standings
  //   if (match.stage === 'group_stage') {
  //     await this.updateGroupStandings(tournament, match);
  //   }

  //   // If this is a knockout match, update the tournament structure
  //   if (match.stage !== 'group_stage') {
  //     await this.processKnockoutMatchResult(tournament, matchIndex);
  //   }

  //   // Check if all matches of a particular stage are completed
  //   // If so, move to the next stage
  //   await this.checkAndAdvanceTournamentStage(tournament);

  //   return this.tournamentRepository
  //     .findRaw()
  //     .findByIdAndUpdate(
  //       tournamentId,
  //       {
  //         groups: tournament.groups,
  //         matches: tournament.matches,
  //         status: tournament.status,
  //       },
  //       { new: true },
  //     )
  //     .populate('organizer', 'username email')
  //     .populate('registeredTeams')
  //     .populate({
  //       path: 'groups.teams',
  //       model: 'Team',
  //     })
  //     .populate({
  //       path: 'groups.standings.team',
  //       model: 'Team',
  //     })
  //     .populate({
  //       path: 'matches.homeTeam',
  //       model: 'Team',
  //     })
  //     .populate({
  //       path: 'matches.awayTeam',
  //       model: 'Team',
  //     })
  //     .exec();
  // }

  private async updateGroupStandings(
    tournament: Tournament,
    match: TournamentMatch,
  ): Promise<void> {
    // Find the group
    const groupIndex = tournament.groups.findIndex(
      (g) => g.name === match.group,
    );
    if (groupIndex === -1) return;

    const group = tournament.groups[groupIndex];

    // Update standings for home team
    const homeTeamIndex = group.standings.findIndex(
      (s) => s.team.toString() === match.homeTeam.toString(),
    );
    if (homeTeamIndex !== -1) {
      const homeStanding = group.standings[homeTeamIndex];
      homeStanding.played += 1;
      homeStanding.goalsFor += match.homeScore;
      homeStanding.goalsAgainst += match.awayScore;

      if (match.homeScore > match.awayScore) {
        // Home team win
        homeStanding.won += 1;
        homeStanding.points += 3;
      } else if (match.homeScore === match.awayScore) {
        // Draw
        homeStanding.drawn += 1;
        homeStanding.points += 1;
      } else {
        // Home team loss
        homeStanding.lost += 1;
      }

      group.standings[homeTeamIndex] = homeStanding;
    }

    // Update standings for away team
    const awayTeamIndex = group.standings.findIndex(
      (s) => s.team.toString() === match.awayTeam.toString(),
    );
    if (awayTeamIndex !== -1) {
      const awayStanding = group.standings[awayTeamIndex];
      awayStanding.played += 1;
      awayStanding.goalsFor += match.awayScore;
      awayStanding.goalsAgainst += match.homeScore;

      if (match.awayScore > match.homeScore) {
        // Away team win
        awayStanding.won += 1;
        awayStanding.points += 3;
      } else if (match.awayScore === match.homeScore) {
        // Draw
        awayStanding.drawn += 1;
        awayStanding.points += 1;
      } else {
        // Away team loss
        awayStanding.lost += 1;
      }

      group.standings[awayTeamIndex] = awayStanding;
    }

    // Sort standings by points, then goal difference, then goals scored
    group.standings.sort((a, b) => {
      if (a.points !== b.points) {
        return b.points - a.points;
      }

      const aGoalDiff = a.goalsFor - a.goalsAgainst;
      const bGoalDiff = b.goalsFor - b.goalsAgainst;
      if (aGoalDiff !== bGoalDiff) {
        return bGoalDiff - aGoalDiff;
      }

      return b.goalsFor - a.goalsFor;
    });

    tournament.groups[groupIndex] = group;
  }

  // private async processKnockoutMatchResult(
  //   tournament: Tournament,
  //   matchIndex: number,
  // ): Promise<void> {
  //   const match = tournament.matches[matchIndex];
  //   let winner: string;

  //   // Determine the winner
  //   if (match.homeScore > match.awayScore) {
  //     winner = match.homeTeam.toString();
  //   } else if (match.awayScore > match.homeScore) {
  //     winner = match.awayTeam.toString();
  //   } else {
  //     // In case of a draw, we can implement penalty shootout logic here
  //     // For simplicity, we'll just pick a random winner for now
  //     winner =
  //       Math.random() > 0.5
  //         ? match.homeTeam.toString()
  //         : match.awayTeam.toString();
  //   }

  //   // Based on the current stage, create the next stage match if needed
  //   // This is a simplified implementation and would need to be expanded based on the tournament structure
  //   switch (match.stage) {
  //     case 'round_of_16':
  //       this.addWinnerToQuarterFinals(tournament, winner, matchIndex);
  //       break;
  //     case 'quarter_final':
  //       this.addWinnerToSemiFinals(tournament, winner, matchIndex);
  //       break;
  //     case 'semi_final':
  //       this.addWinnerToFinal(tournament, winner, matchIndex);
  //       break;
  //     case 'final':
  //       tournament.status = TournamentStatus.COMPLETED;
  //       break;
  //   }
  // }

  // private addWinnerToQuarterFinals(
  //   tournament: Tournament,
  //   winnerTeamId: string,
  //   matchIndex: number,
  // ): void {
  //   // Simplified logic - in a real application, you'd need more sophisticated match pairing
  //   const quarterFinalMatchIndex = Math.floor(matchIndex / 2);
  //   const isFirstMatchOfPair = matchIndex % 2 === 0;

  //   // Find if quarter-final match already exists
  //   const existingMatchIndex = tournament.matches.findIndex(
  //     (m) =>
  //       m.stage === 'quarter_final' &&
  //       m.homeTeam === null &&
  //       m.awayTeam === null,
  //   );

  //   if (existingMatchIndex !== -1) {
  //     // Add winner to existing match
  //     if (isFirstMatchOfPair) {
  //       tournament.matches[existingMatchIndex].homeTeam = winnerTeamId as any;
  //     } else {
  //       tournament.matches[existingMatchIndex].awayTeam = winnerTeamId as any;
  //     }
  //   } else {
  //     // Create new quarter-final match
  //     const newMatch: TournamentMatch = {
  //       homeTeam: isFirstMatchOfPair ? (winnerTeamId as any) : null,
  //       awayTeam: isFirstMatchOfPair ? null : (winnerTeamId as any),
  //       homeScore: null,
  //       awayScore: null,
  //       location:
  //         tournament.locations.length > 0
  //           ? tournament.locations[Math.min(1, tournament.locations.length - 1)]
  //           : {
  //               name: 'Default Location',
  //               address: 'TBD',
  //               city: 'TBD',
  //               country: 'TBD',
  //               location: { type: 'Point', coordinates: [0, 0] },
  //             },
  //       scheduledDate: new Date(
  //         Date.now() + tournament.matches.length * 24 * 60 * 60 * 1000,
  //       ),
  //       completed: false,
  //       stage: 'quarter_final',
  //       group: '',
  //     };

  //     tournament.matches.push(newMatch);
  //   }
  // }

  // private addWinnerToSemiFinals(
  //   tournament: Tournament,
  //   winnerTeamId: string,
  //   matchIndex: number,
  // ): void {
  //   // Similar logic as addWinnerToQuarterFinals
  //   const semiFinalMatchIndex = Math.floor(matchIndex / 2);
  //   const isFirstMatchOfPair = matchIndex % 2 === 0;

  //   const existingMatchIndex = tournament.matches.findIndex(
  //     (m) =>
  //       m.stage === 'semi_final' &&
  //       ((isFirstMatchOfPair && m.homeTeam === null) ||
  //         (!isFirstMatchOfPair && m.awayTeam === null)),
  //   );

  //   if (existingMatchIndex !== -1) {
  //     if (isFirstMatchOfPair) {
  //       tournament.matches[existingMatchIndex].homeTeam = winnerTeamId as any;
  //     } else {
  //       tournament.matches[existingMatchIndex].awayTeam = winnerTeamId as any;
  //     }
  //   } else {
  //     const newMatch: TournamentMatch = {
  //       homeTeam: isFirstMatchOfPair ? (winnerTeamId as any) : null,
  //       awayTeam: isFirstMatchOfPair ? null : (winnerTeamId as any),
  //       homeScore: null,
  //       awayScore: null,
  //       location:
  //         tournament.locations.length > 0
  //           ? tournament.locations[Math.min(1, tournament.locations.length - 1)]
  //           : {
  //               name: 'Default Location',
  //               address: 'TBD',
  //               city: 'TBD',
  //               country: 'TBD',
  //               location: { type: 'Point', coordinates: [0, 0] },
  //             },
  //       scheduledDate: new Date(
  //         Date.now() + tournament.matches.length * 24 * 60 * 60 * 1000,
  //       ),
  //       completed: false,
  //       stage: 'semi_final',
  //       group: '',
  //     };

  //     tournament.matches.push(newMatch);
  //   }
  // }

  // private addWinnerToFinal(
  //   tournament: Tournament,
  //   winnerTeamId: string,
  //   matchIndex: number,
  // ): void {
  //   const isFirstSemiFinal = matchIndex % 2 === 0;

  //   const finalMatchIndex = tournament.matches.findIndex(
  //     (m) => m.stage === 'final',
  //   );
  //   if (finalMatchIndex !== -1) {
  //     if (isFirstSemiFinal) {
  //       tournament.matches[finalMatchIndex].homeTeam = winnerTeamId as any;
  //     } else {
  //       tournament.matches[finalMatchIndex].awayTeam = winnerTeamId as any;
  //     }
  //   } else {
  //     // Create final match
  //     const newMatch: TournamentMatch = {
  //       homeTeam: isFirstSemiFinal ? (winnerTeamId as any) : null,
  //       awayTeam: isFirstSemiFinal ? null : (winnerTeamId as any),
  //       homeScore: null,
  //       awayScore: null,
  //       location:
  //         tournament.locations.length > 0
  //           ? tournament.locations[Math.min(1, tournament.locations.length - 1)]
  //           : {
  //               name: 'Default Location',
  //               address: 'TBD',
  //               city: 'TBD',
  //               country: 'TBD',
  //               location: { type: 'Point', coordinates: [0, 0] },
  //             },
  //       scheduledDate: new Date(
  //         Date.now() + tournament.matches.length * 24 * 60 * 60 * 1000,
  //       ),
  //       completed: false,
  //       stage: 'final',
  //       group: '',
  //     };

  //     tournament.matches.push(newMatch);
  //   }
  // }

  // private async checkAndAdvanceTournamentStage(
  //   tournament: Tournament,
  // ): Promise<void> {
  //   // Count completed matches by stage
  //   const groupStageMatches = tournament.matches.filter(
  //     (m) => m.stage === 'group_stage',
  //   );
  //   const groupStageCompleted = groupStageMatches.every((m) => m.completed);

  //   // If all group stage matches are completed and tournament is in group stage, advance to knockout
  //   if (
  //     groupStageCompleted &&
  //     tournament.status === TournamentStatus.GROUP_STAGE
  //   ) {
  //     await this.createKnockoutPhase(tournament);
  //     tournament.status = TournamentStatus.KNOCKOUT_PHASE;
  //   }

  //   // Similarly for other stages
  //   const round16Matches = tournament.matches.filter(
  //     (m) => m.stage === 'round_of_16',
  //   );
  //   const quarterFinalMatches = tournament.matches.filter(
  //     (m) => m.stage === 'quarter_final',
  //   );
  //   const semiFinalMatches = tournament.matches.filter(
  //     (m) => m.stage === 'semi_final',
  //   );
  //   const finalMatch = tournament.matches.find((m) => m.stage === 'final');

  //   if (finalMatch && finalMatch.completed) {
  //     tournament.status = TournamentStatus.COMPLETED;
  //   }
  // }

  // private async createKnockoutPhase(tournament: Tournament): Promise<void> {
  //   // Get qualified teams from group stage (top 2 from each group)
  //   const qualifiedTeams = [];
  //   for (const group of tournament.groups) {
  //     if (group.standings.length >= 2) {
  //       qualifiedTeams.push(group.standings[0].team); // 1st place
  //       qualifiedTeams.push(group.standings[1].team); // 2nd place
  //     }
  //   }

  //   // If we don't have enough teams, fill with random teams
  //   // (This is just for demonstration - in a real app you'd handle this differently)
  //   while (
  //     qualifiedTeams.length < 16 &&
  //     tournament.registeredTeams.length > 0
  //   ) {
  //     const randomTeam =
  //       tournament.registeredTeams[
  //         Math.floor(Math.random() * tournament.registeredTeams.length)
  //       ];
  //     if (!qualifiedTeams.includes(randomTeam)) {
  //       qualifiedTeams.push(randomTeam);
  //     }
  //   }

  //   // Shuffle teams to create round of 16 matchups
  //   // In a real UCL, there are specific rules for this draw
  //   const shuffledTeams = [...qualifiedTeams];
  //   for (let i = shuffledTeams.length - 1; i > 0; i--) {
  //     const j = Math.floor(Math.random() * (i + 1));
  //     [shuffledTeams[i], shuffledTeams[j]] = [
  //       shuffledTeams[j],
  //       shuffledTeams[i],
  //     ];
  //   }

  //   // Create Round of 16 matches
  //   for (let i = 0; i < shuffledTeams.length; i += 2) {
  //     if (i + 1 < shuffledTeams.length) {
  //       const homeMatch: TournamentMatch = {
  //         homeTeam: shuffledTeams[i],
  //         awayTeam: shuffledTeams[i + 1],
  //         homeScore: null,
  //         awayScore: null,
  //         location:
  //           tournament.locations.length > 0
  //             ? tournament.locations[
  //                 Math.min(1, tournament.locations.length - 1)
  //               ]
  //             : {
  //                 name: 'Default Location',
  //                 address: 'TBD',
  //                 city: 'TBD',
  //                 country: 'TBD',
  //                 location: { type: 'Point', coordinates: [0, 0] },
  //               },
  //         scheduledDate: new Date(
  //           Date.now() + tournament.matches.length * 24 * 60 * 60 * 1000,
  //         ),
  //         completed: false,
  //         stage: 'round_of_16',
  //         group: '',
  //       };

  //       const awayMatch: TournamentMatch = {
  //         homeTeam: shuffledTeams[i + 1],
  //         awayTeam: shuffledTeams[i],
  //         homeScore: null,
  //         awayScore: null,
  //         location:
  //           tournament.locations.length > 0
  //             ? tournament.locations[
  //                 Math.min(1, tournament.locations.length - 1)
  //               ]
  //             : {
  //                 name: 'Default Location',
  //                 address: 'TBD',
  //                 city: 'TBD',
  //                 country: 'TBD',
  //                 location: { type: 'Point', coordinates: [0, 0] },
  //               },
  //         scheduledDate: new Date(
  //           Date.now() + (tournament.matches.length + 1) * 24 * 60 * 60 * 1000,
  //         ),
  //         completed: false,
  //         stage: 'round_of_16',
  //         group: '',
  //       };

  //       tournament.matches.push(homeMatch, awayMatch);
  //     }
  //   }
  // }

  async getTournamentsByOrganizerId(
    organizerId: string,
  ): Promise<Tournament[]> {
    return this.tournamentRepository
      .findRaw()
      .find({ organizer: organizerId })
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .exec();
  }

  async getTournamentsByTeamId(teamId: string): Promise<Tournament[]> {
    return this.tournamentRepository
      .findRaw()
      .find({ registeredTeams: teamId })
      .populate('organizer', 'username email')
      .populate('registeredTeams')
      .exec();
  }

  async getUpcomingMatches(
    tournamentId: string,
    teamId?: string,
  ): Promise<TournamentMatch[]> {
    const tournament = await this.tournamentRepository.findOne({
      _id: tournamentId,
    });

    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${tournamentId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    let matches = tournament.matches.filter((match) => !match.completed);

    if (teamId) {
      matches = matches.filter(
        (match) =>
          match.homeTeam?.toString() === teamId ||
          match.awayTeam?.toString() === teamId,
      );
    }

    // Sort by scheduled date
    matches.sort(
      (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime(),
    );

    return matches;
  }

  async getCompletedMatches(
    tournamentId: string,
    teamId?: string,
  ): Promise<TournamentMatch[]> {
    const tournament = await this.tournamentRepository.findOne({
      _id: tournamentId,
    });
    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${tournamentId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    let matches = tournament.matches.filter((match) => match.completed);

    if (teamId) {
      matches = matches.filter(
        (match) =>
          match.homeTeam?.toString() === teamId ||
          match.awayTeam?.toString() === teamId,
      );
    }
    // Sort by scheduled date
    matches.sort(
      (a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime(),
    );

    return matches;
  }

  async getGroupStandings(
    tournamentId: string,
    groupName?: string,
  ): Promise<Group[]> {
    const tournament = await this.tournamentRepository.findOne({
      _id: tournamentId,
    });

    if (!tournament) {
      throw new CustomHttpException(
        `Tournament with ID ${tournamentId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (groupName) {
      const group = tournament.groups.find((g) => g.name === groupName);
      if (!group) {
        throw new CustomHttpException(
          `Group ${groupName} not found in tournament`,
          HttpStatus.NOT_FOUND,
        );
      }
      return [group];
    }

    return tournament.groups;
  }
}
