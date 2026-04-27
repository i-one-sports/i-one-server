import { HttpStatus, Injectable } from '@nestjs/common';
import { TournamentRepository } from './tournaments.repository';
import { TeamRepository } from './teams.repository';
import { UserRepository } from 'src/users/users.repository';
import { CreateTournamentDto, CreateTeamAndRegisterDto, RecordMatchResultDto, ManualAdvanceDto, ScheduleMatchDto } from './dto/tournament.dto';
import { CustomHttpException, Tournament, TournamentStatus } from '@app/common';
import { LocationRepository } from 'src/locations/locations.repository';
import { Types } from 'mongoose';
import { BracketMatch, TeamSlot } from '@app/common/schemas/tournament.schema';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly teamRepository: TeamRepository,
    private readonly locationRepository: LocationRepository,
    private readonly userRepository: UserRepository,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private getRoundNames(maxTeams: number): string[] {
    const rounds: Record<number, string[]> = {
      8:  ['Quarter-final', 'Semi-final', 'Final'],
      16: ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
      32: ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
    };
    return rounds[maxTeams];
  }

  private buildBracket(teams: TeamSlot[], maxTeams: number): BracketMatch[] {
    const totalRounds = Math.log2(maxTeams);
    const roundNames = this.getRoundNames(maxTeams);

    // Compute starting matchIndex for each round
    const offsets: number[] = [0];
    for (let r = 1; r < totalRounds; r++) {
      offsets[r] = offsets[r - 1] + maxTeams / Math.pow(2, r);
    }

    const shuffled: (TeamSlot | null)[] = this.shuffle([...teams]);
    // Pad with nulls (byes) if fewer teams than maxTeams
    while (shuffled.length < maxTeams) shuffled.push(null);

    const bracket: BracketMatch[] = [];

    for (let r = 0; r < totalRounds; r++) {
      const matchesInRound = maxTeams / Math.pow(2, r + 1);
      const isLastRound = r === totalRounds - 1;

      for (let pos = 0; pos < matchesInRound; pos++) {
        const idx = offsets[r] + pos;
        const match: BracketMatch = {
          matchIndex: idx,
          round: r + 1,
          roundName: roundNames[r],
          home: r === 0 ? shuffled[pos * 2] : null,
          away: r === 0 ? shuffled[pos * 2 + 1] : null,
          homeScore: null,
          awayScore: null,
          winner: null,
          completed: false,
          scheduledTime: null,
          nextMatchIndex: isLastRound ? null : offsets[r + 1] + Math.floor(pos / 2),
          nextMatchSlot: isLastRound ? null : (pos % 2 === 0 ? 'home' : 'away'),
        };

        // Auto-advance byes in round 1
        if (r === 0) {
          if (match.home && !match.away) {
            match.winner = match.home;
            match.completed = true;
          } else if (!match.home && match.away) {
            match.winner = match.away;
            match.completed = true;
          }
        }

        bracket.push(match);
      }
    }

    return bracket;
  }

  // ─── Tournament CRUD ───────────────────────────────────────────────────────

  async create(dto: CreateTournamentDto, locationId: string, organizerId: string): Promise<Tournament> {
    const location = await this.locationRepository.findOne({ _id: locationId });
    if (!location) throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);

    let code = this.generateCode();
    // Ensure uniqueness
    while (await this.tournamentRepository.findOne({ code })) {
      code = this.generateCode();
    }

    return this.tournamentRepository.create({
      _id: new Types.ObjectId(),
      name: dto.name,
      description: dto.description ?? '',
      location: new Types.ObjectId(locationId),
      organizer: new Types.ObjectId(organizerId),
      prizeMoney: dto.prizeMoney,
      registrationFee: dto.registrationFee,
      maxTeams: dto.maxTeams,
      code,
      status: TournamentStatus.REGISTRATION,
      registeredTeams: [],
      bracket: [],
      winner: null,
      registrationDeadline: dto.registrationDeadline,
      startDate: dto.startDate,
      endDate: new Date(dto.startDate.getTime() + dto.durationDays * 86_400_000),
    });
  }

  // List tournaments for a location — lean, no population needed
  async findByLocation(locationId: string) {
    return this.tournamentRepository
      .findRaw()
      .find({ location: new Types.ObjectId(locationId) })
      .select('name status maxTeams registeredTeams startDate endDate registrationDeadline prizeMoney registrationFee code winner')
      .lean();
  }

  // Full tournament detail — one query, populate only team names/logos for Teams tab
  async findOne(id: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(id)
      .populate('organizer', 'firstName lastName nickname -password')
      .populate('registeredTeams', 'name logo captain')
      .lean();

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    return tournament;
  }

  // ─── Team Registration ─────────────────────────────────────────────────────

  async createTeamAndRegister(tournamentId: string, dto: CreateTeamAndRegisterDto) {
    // Single query to get tournament status + team count
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status maxTeams registeredTeams')
      .lean();

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.status !== TournamentStatus.REGISTRATION)
      throw new CustomHttpException('Tournament is not in registration phase', HttpStatus.BAD_REQUEST);
    if (tournament.registeredTeams.length >= tournament.maxTeams)
      throw new CustomHttpException('Tournament is full', HttpStatus.BAD_REQUEST);

    const captain = await this.userRepository.findOne({ _id: dto.captainId });
    if (!captain) throw new CustomHttpException('Captain not found', HttpStatus.NOT_FOUND);

    const playerIds = [...new Set([dto.captainId, ...(dto.playerIds ?? [])])];

    const team = await this.teamRepository.create({
      _id: new Types.ObjectId(),
      name: dto.teamName,
      logo: dto.logo ?? '',
      captain: dto.captainId as any,
      players: playerIds as any,
    });

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        { $addToSet: { registeredTeams: team._id } },
      );

    return team;
  }

  async unregisterTeam(tournamentId: string, teamId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status')
      .lean();

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.status !== TournamentStatus.REGISTRATION)
      throw new CustomHttpException('Cannot unregister after tournament has started', HttpStatus.BAD_REQUEST);

    await this.tournamentRepository
      .findRaw()
      .updateOne({ _id: tournamentId }, { $pull: { registeredTeams: new Types.ObjectId(teamId) } });

    return { message: 'Team unregistered' };
  }

  // ─── Bracket ───────────────────────────────────────────────────────────────

  async startTournament(tournamentId: string, organizerId: string) {
    // Fetch only what we need
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status organizer maxTeams registeredTeams')
      .lean();

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can start the tournament', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.REGISTRATION)
      throw new CustomHttpException('Tournament already started', HttpStatus.BAD_REQUEST);
    if (tournament.registeredTeams.length < 2)
      throw new CustomHttpException('Need at least 2 teams to start', HttpStatus.BAD_REQUEST);

    // Fetch team names/logos in one query
    const teams = await this.teamRepository
      .findRaw()
      .find({ _id: { $in: tournament.registeredTeams } })
      .select('name logo')
      .lean();

    const teamSlots: TeamSlot[] = teams.map((t: any) => ({
      teamId: t._id,
      name: t.name,
      logo: t.logo ?? '',
    }));

    const bracket = this.buildBracket(teamSlots, tournament.maxTeams);

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        { $set: { status: TournamentStatus.STARTED, bracket } },
      );

    return { message: 'Tournament started', bracket };
  }

  // ─── Match Result ──────────────────────────────────────────────────────────

  async recordResult(tournamentId: string, matchIndex: number, dto: RecordMatchResultDto, organizerId: string) {
    // Load only the bracket to find match metadata — avoids loading teams/etc
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status bracket')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can record results', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);

    const match: BracketMatch = tournament.bracket.find((m: BracketMatch) => m.matchIndex === matchIndex);
    if (!match) throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    if (match.completed) throw new CustomHttpException('Match already completed', HttpStatus.BAD_REQUEST);
    if (!match.home || !match.away) throw new CustomHttpException('Match is not ready — waiting for both teams', HttpStatus.BAD_REQUEST);
    if (dto.homeScore === dto.awayScore)
      throw new CustomHttpException('Draws are not allowed in knockout — use manual advance to pick a winner', HttpStatus.BAD_REQUEST);

    const winner: TeamSlot = dto.homeScore > dto.awayScore ? match.home : match.away;
    const isFinal = match.nextMatchIndex === null;

    const arrayFilters: any[] = [{ 'match.matchIndex': matchIndex }];
    const setOp: Record<string, any> = {
      'bracket.$[match].homeScore': dto.homeScore,
      'bracket.$[match].awayScore': dto.awayScore,
      'bracket.$[match].winner': winner,
      'bracket.$[match].completed': true,
    };

    if (!isFinal) {
      const slot = match.nextMatchSlot === 'home' ? 'home' : 'away';
      arrayFilters.push({ 'next.matchIndex': match.nextMatchIndex });
      setOp[`bracket.$[next].${slot}`] = winner;
    } else {
      setOp['winner'] = winner;
      setOp['status'] = TournamentStatus.COMPLETED;
    }

    await this.tournamentRepository
      .findRaw()
      .updateOne({ _id: tournamentId }, { $set: setOp }, { arrayFilters });

    return { message: 'Result recorded', winner, isFinal };
  }

  async manualAdvance(tournamentId: string, matchIndex: number, dto: ManualAdvanceDto, organizerId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status bracket')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can advance teams', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);

    const match: BracketMatch = tournament.bracket.find((m: BracketMatch) => m.matchIndex === matchIndex);
    if (!match) throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    if (match.completed) throw new CustomHttpException('Match already completed', HttpStatus.BAD_REQUEST);
    if (!match.home || !match.away) throw new CustomHttpException('Match is not ready — waiting for both teams', HttpStatus.BAD_REQUEST);

    const winner: TeamSlot = dto.winner === 'home' ? match.home : match.away;
    const isFinal = match.nextMatchIndex === null;

    const arrayFilters: any[] = [{ 'match.matchIndex': matchIndex }];
    const setOp: Record<string, any> = {
      'bracket.$[match].winner': winner,
      'bracket.$[match].completed': true,
    };

    if (!isFinal) {
      const slot = match.nextMatchSlot === 'home' ? 'home' : 'away';
      arrayFilters.push({ 'next.matchIndex': match.nextMatchIndex });
      setOp[`bracket.$[next].${slot}`] = winner;
    } else {
      setOp['winner'] = winner;
      setOp['status'] = TournamentStatus.COMPLETED;
    }

    await this.tournamentRepository
      .findRaw()
      .updateOne({ _id: tournamentId }, { $set: setOp }, { arrayFilters });

    return { message: 'Team advanced', winner, isFinal };
  }

  async scheduleMatch(tournamentId: string, matchIndex: number, dto: ScheduleMatchDto, organizerId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can schedule matches', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        { $set: { 'bracket.$[match].scheduledTime': dto.scheduledTime } },
        { arrayFilters: [{ 'match.matchIndex': matchIndex }] },
      );

    return { message: 'Match scheduled' };
  }
}
