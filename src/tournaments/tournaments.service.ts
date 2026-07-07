import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { TournamentRepository } from './tournaments.repository';
import { TeamRepository } from './teams.repository';
import { UserRepository } from 'src/users/users.repository';
import { CreateTournamentDto, CreateTeamAndRegisterDto, RecordMatchResultDto, ManualAdvanceDto, ScheduleMatchDto } from './dto/tournament.dto';
import { CustomHttpException, Tournament, TournamentStatus, TournamentType, TournamentUpdateEvent } from '@app/common';
import { LocationRepository } from 'src/locations/locations.repository';
import { Types } from 'mongoose';
import { BracketMatch, LeagueFixture, LeagueStanding, TeamSlot } from '@app/common/schemas/tournament.schema';
import { TournamentEventService } from './tournament-event.service';
import { TournamentPaymentService } from 'src/billing/services/tournament-payment.service';

const KNOCKOUT_SIZES = [8, 16, 32];

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly teamRepository: TeamRepository,
    private readonly locationRepository: LocationRepository,
    private readonly userRepository: UserRepository,
    private readonly tournamentEventService: TournamentEventService,
    private readonly tournamentPaymentService: TournamentPaymentService,
  ) {}

  // Fire-and-forget broadcast — same pipeline matches.service.ts uses for
  // emitMatchScoreUpdate (Redis pub/sub → SSE), so viewers don't have to poll
  // GET /tournaments/:id for bracket/fixture/standings changes.
  private broadcast(event: TournamentUpdateEvent): void {
    this.tournamentEventService
      .emitTournamentUpdate(event)
      .catch((err) => this.logger.error('Failed to emit tournament update event', err));
  }

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

  // Single round-robin via the circle method: fix team[0], rotate the rest.
  // n teams (n even after padding with a bye) → n-1 rounds of n/2 fixtures.
  private buildFixtures(teams: TeamSlot[]): LeagueFixture[] {
    const slots: (TeamSlot | null)[] = this.shuffle([...teams]);
    if (slots.length % 2 !== 0) slots.push(null); // bye for odd team counts

    const n = slots.length;
    const half = n / 2;
    let arr = [...slots];
    const fixtures: LeagueFixture[] = [];
    let matchIndex = 0;

    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < half; i++) {
        const home = arr[i];
        const away = arr[n - 1 - i];
        if (!home || !away) continue; // bye — no fixture this round

        fixtures.push({
          matchIndex: matchIndex++,
          round: round + 1,
          home,
          away,
          homeScore: null,
          awayScore: null,
          completed: false,
          scheduledTime: null,
        });
      }
      // Rotate all but the fixed first slot
      arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    }

    return fixtures;
  }

  private initStandings(teams: TeamSlot[]): LeagueStanding[] {
    return teams.map((t) => ({
      teamId: t.teamId,
      name: t.name,
      logo: t.logo,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    }));
  }

  // ─── Tournament CRUD ───────────────────────────────────────────────────────

  async create(dto: CreateTournamentDto, locationId: string, organizerId: string): Promise<Tournament> {
    const location = await this.locationRepository.findOne({ _id: locationId });
    if (!location) throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);

    if (dto.type === TournamentType.KNOCKOUT && !KNOCKOUT_SIZES.includes(dto.maxTeams)) {
      throw new CustomHttpException('maxTeams must be 8, 16, or 32 for knockout tournaments', HttpStatus.BAD_REQUEST);
    }

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
      type: dto.type,
      prizeMoney: dto.prizeMoney,
      registrationFee: dto.registrationFee,
      minutesPerMatch: dto.minutesPerMatch,
      playersPerTeam: dto.playersPerTeam,
      maxTeams: dto.maxTeams,
      pitches: dto.pitches ?? [],
      teamPrizes: dto.teamPrizes ?? [],
      playerPrizes: dto.playerPrizes ?? [],
      rules: dto.rules ?? [],
      code,
      status: TournamentStatus.REGISTRATION,
      registeredTeams: [],
      bracket: [],
      fixtures: [],
      standings: [],
      totalFixtures: 0,
      completedFixtures: 0,
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
      .select('name status type maxTeams registeredTeams startDate endDate registrationDeadline prizeMoney registrationFee code winner')
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

  async createTeamAndRegister(tournamentId: string, dto: CreateTeamAndRegisterDto, userId: string) {
    if (dto.captainId !== userId)
      throw new CustomHttpException('Only the captain can register their own team', HttpStatus.FORBIDDEN);

    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status maxTeams registeredTeams location registrationFee')
      .lean() as any;

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

    // If the tournament charges a registration fee, create a PENDING payment record.
    // The captain calls POST /tournaments/:id/team/:teamId/pay to get the checkout URL.
    if (tournament.registrationFee > 0) {
      const location = await this.locationRepository.findOne({ _id: tournament.location });
      if (location?.owner) {
        await this.tournamentPaymentService.createPendingPayment(
          new Types.ObjectId(tournamentId),
          team._id,
          captain._id,
          tournament.location,
          location.owner as Types.ObjectId,
          tournament.registrationFee,
        );
      }
    }

    return team;
  }

  async unregisterTeam(tournamentId: string, teamId: string, userId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status organizer')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.status !== TournamentStatus.REGISTRATION)
      throw new CustomHttpException('Cannot unregister after tournament has started', HttpStatus.BAD_REQUEST);

    const team = await this.teamRepository.findOne({ _id: teamId });
    if (!team) throw new CustomHttpException('Team not found', HttpStatus.NOT_FOUND);

    const isCaptain = team.captain.toString() === userId;
    const isOrganizer = tournament.organizer.toString() === userId;
    if (!isCaptain && !isOrganizer)
      throw new CustomHttpException('Only the team captain or the organizer can unregister this team', HttpStatus.FORBIDDEN);

    await this.tournamentRepository
      .findRaw()
      .updateOne({ _id: tournamentId }, { $pull: { registeredTeams: new Types.ObjectId(teamId) } });

    return { message: 'Team unregistered' };
  }

  // ─── Bracket / Fixtures ────────────────────────────────────────────────────

  async startTournament(tournamentId: string, organizerId: string) {
    // Fetch only what we need
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('status organizer type maxTeams registeredTeams location')
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

    if (tournament.type === TournamentType.LEAGUE) {
      const fixtures = this.buildFixtures(teamSlots);
      const standings = this.initStandings(teamSlots);

      await this.tournamentRepository
        .findRaw()
        .updateOne(
          { _id: tournamentId },
          {
            $set: {
              status: TournamentStatus.STARTED,
              fixtures,
              standings,
              totalFixtures: fixtures.length,
              completedFixtures: 0,
            },
          },
        );

      this.broadcast({
        tournamentId,
        locationId: tournament.location,
        status: TournamentStatus.STARTED,
        event: 'started',
      });

      return { message: 'Tournament started', fixtures, standings };
    }

    const bracket = this.buildBracket(teamSlots, tournament.maxTeams);

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        { $set: { status: TournamentStatus.STARTED, bracket } },
      );

    this.broadcast({
      tournamentId,
      locationId: tournament.location,
      status: TournamentStatus.STARTED,
      event: 'started',
    });

    return { message: 'Tournament started', bracket };
  }

  // ─── Match Result ──────────────────────────────────────────────────────────

  async recordResult(tournamentId: string, matchIndex: number, dto: RecordMatchResultDto, organizerId: string) {
    // Load only what's needed to find match metadata — avoids loading teams/etc
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status type location bracket fixtures totalFixtures completedFixtures')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can record results', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);

    if (tournament.type === TournamentType.LEAGUE) {
      return this.recordLeagueResult(tournamentId, tournament, matchIndex, dto);
    }

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

    this.broadcast({
      tournamentId,
      locationId: tournament.location,
      status: isFinal ? TournamentStatus.COMPLETED : TournamentStatus.STARTED,
      event: 'result',
      matchIndex,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      winner,
      isFinal,
    });

    return { message: 'Result recorded', winner, isFinal };
  }

  // League result: one atomic $set + $inc updates the fixture and both teams'
  // standings rows in place — O(1) regardless of league size, no table recompute.
  private async recordLeagueResult(tournamentId: string, tournament: any, matchIndex: number, dto: RecordMatchResultDto) {
    const fixture: LeagueFixture = tournament.fixtures.find((f: LeagueFixture) => f.matchIndex === matchIndex);
    if (!fixture) throw new CustomHttpException('Fixture not found', HttpStatus.NOT_FOUND);
    if (fixture.completed) throw new CustomHttpException('Fixture already completed', HttpStatus.BAD_REQUEST);
    if (!fixture.home || !fixture.away) throw new CustomHttpException('Fixture is not ready — waiting for both teams', HttpStatus.BAD_REQUEST);

    const homeOutcome = dto.homeScore > dto.awayScore ? 'win' : dto.homeScore < dto.awayScore ? 'loss' : 'draw';
    const awayOutcome = homeOutcome === 'win' ? 'loss' : homeOutcome === 'loss' ? 'win' : 'draw';
    const pointsFor = (outcome: 'win' | 'draw' | 'loss') => (outcome === 'win' ? 3 : outcome === 'draw' ? 1 : 0);

    const isFinal = tournament.completedFixtures + 1 === tournament.totalFixtures;

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        {
          $set: {
            'fixtures.$[fx].homeScore': dto.homeScore,
            'fixtures.$[fx].awayScore': dto.awayScore,
            'fixtures.$[fx].completed': true,
          },
          $inc: {
            completedFixtures: 1,
            'standings.$[home].played': 1,
            'standings.$[home].wins': homeOutcome === 'win' ? 1 : 0,
            'standings.$[home].draws': homeOutcome === 'draw' ? 1 : 0,
            'standings.$[home].losses': homeOutcome === 'loss' ? 1 : 0,
            'standings.$[home].goalsFor': dto.homeScore,
            'standings.$[home].goalsAgainst': dto.awayScore,
            'standings.$[home].goalDifference': dto.homeScore - dto.awayScore,
            'standings.$[home].points': pointsFor(homeOutcome),
            'standings.$[away].played': 1,
            'standings.$[away].wins': awayOutcome === 'win' ? 1 : 0,
            'standings.$[away].draws': awayOutcome === 'draw' ? 1 : 0,
            'standings.$[away].losses': awayOutcome === 'loss' ? 1 : 0,
            'standings.$[away].goalsFor': dto.awayScore,
            'standings.$[away].goalsAgainst': dto.homeScore,
            'standings.$[away].goalDifference': dto.awayScore - dto.homeScore,
            'standings.$[away].points': pointsFor(awayOutcome),
          },
        },
        {
          arrayFilters: [
            { 'fx.matchIndex': matchIndex },
            { 'home.teamId': fixture.home.teamId },
            { 'away.teamId': fixture.away.teamId },
          ],
        },
      );

    this.broadcast({
      tournamentId,
      locationId: tournament.location,
      status: isFinal ? TournamentStatus.COMPLETED : TournamentStatus.STARTED,
      event: 'result',
      matchIndex,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      isFinal,
    });

    if (isFinal) {
      await this.completeLeague(tournamentId, tournament.location);
    }

    return { message: 'Result recorded', isFinal };
  }

  // Final matchday just completed — read the (now fully updated) table once,
  // rank it, and persist the winner. One-time O(n log n) cost at completion.
  private async completeLeague(tournamentId: string, locationId?: string | Types.ObjectId) {
    const doc = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('standings')
      .lean() as any;

    const ranked = [...doc.standings].sort(
      (a: LeagueStanding, b: LeagueStanding) =>
        b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
    );
    const champion = ranked[0];
    const winner: TeamSlot | null = champion
      ? { teamId: champion.teamId, name: champion.name, logo: champion.logo }
      : null;

    await this.tournamentRepository
      .findRaw()
      .updateOne({ _id: tournamentId }, { $set: { status: TournamentStatus.COMPLETED, winner } });

    this.broadcast({
      tournamentId,
      locationId,
      status: TournamentStatus.COMPLETED,
      event: 'completed',
      winner,
      isFinal: true,
    });
  }

  async manualAdvance(tournamentId: string, matchIndex: number, dto: ManualAdvanceDto, organizerId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status type location bracket')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can advance teams', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);
    if (tournament.type !== TournamentType.KNOCKOUT)
      throw new CustomHttpException('Manual advance only applies to knockout tournaments — leagues accept draws as valid results', HttpStatus.BAD_REQUEST);

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

    this.broadcast({
      tournamentId,
      locationId: tournament.location,
      status: isFinal ? TournamentStatus.COMPLETED : TournamentStatus.STARTED,
      event: 'advance',
      matchIndex,
      winner,
      isFinal,
    });

    return { message: 'Team advanced', winner, isFinal };
  }

  async scheduleMatch(tournamentId: string, matchIndex: number, dto: ScheduleMatchDto, organizerId: string) {
    const tournament = await this.tournamentRepository
      .findRaw()
      .findById(tournamentId)
      .select('organizer status type location')
      .lean() as any;

    if (!tournament) throw new CustomHttpException('Tournament not found', HttpStatus.NOT_FOUND);
    if (tournament.organizer.toString() !== organizerId)
      throw new CustomHttpException('Only the organizer can schedule matches', HttpStatus.FORBIDDEN);
    if (tournament.status !== TournamentStatus.STARTED)
      throw new CustomHttpException('Tournament is not in progress', HttpStatus.BAD_REQUEST);

    const field = tournament.type === TournamentType.LEAGUE ? 'fixtures' : 'bracket';

    await this.tournamentRepository
      .findRaw()
      .updateOne(
        { _id: tournamentId },
        { $set: { [`${field}.$[match].scheduledTime`]: dto.scheduledTime } },
        { arrayFilters: [{ 'match.matchIndex': matchIndex }] },
      );

    this.broadcast({
      tournamentId,
      locationId: tournament.location,
      status: tournament.status,
      event: 'scheduled',
      matchIndex,
      scheduledTime: dto.scheduledTime,
    });

    return { message: 'Match scheduled' };
  }
}
