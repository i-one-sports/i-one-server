import { Types } from 'mongoose';
import { TournamentStatus } from '@app/common';
import { CustomHttpException } from '@app/common';
import { TournamentsService } from './tournaments.service';

// Mimics a chained Mongoose query (findRaw().findById(...).select(...).lean())
// — every method returns the same chain object except the terminal one,
// which resolves the given value.
function chainable(resolvedValue: any) {
  const chain: any = {
    findById: jest.fn(() => chain),
    findOne: jest.fn(() => chain),
    select: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(resolvedValue),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  return chain;
}

describe('TournamentsService', () => {
  let service: TournamentsService;
  let tournamentRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    findRaw: jest.Mock;
  };
  let teamRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    findRaw: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let locationRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let tournamentEventService: { emitTournamentUpdate: jest.Mock };
  let tournamentPaymentService: { createPendingPayment: jest.Mock };

  const tournamentId = new Types.ObjectId();
  const captainId = new Types.ObjectId();
  const teamId = new Types.ObjectId();

  beforeEach(() => {
    tournamentRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      findRaw: jest.fn(),
    };
    teamRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      findRaw: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    locationRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    tournamentEventService = { emitTournamentUpdate: jest.fn().mockResolvedValue(undefined) };
    tournamentPaymentService = { createPendingPayment: jest.fn().mockResolvedValue(undefined) };

    service = new TournamentsService(
      tournamentRepository as any,
      teamRepository as any,
      locationRepository as any,
      userRepository as any,
      tournamentEventService as any,
      tournamentPaymentService as any,
    );
  });

  describe('create', () => {
    it('retries code generation on collision', async () => {
      locationRepository.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      // First generated code collides, second doesn't.
      tournamentRepository.findOne
        .mockResolvedValueOnce({ code: 'TAKEN1' })
        .mockResolvedValueOnce(null);
      tournamentRepository.create.mockResolvedValue({ _id: tournamentId });

      await service.create(
        {
          name: 'Cup',
          type: 'knockout' as any,
          prizeMoney: 0,
          registrationFee: 0,
          minutesPerMatch: 90,
          playersPerTeam: 5,
          maxTeams: 8,
          registrationDeadline: new Date(),
          startDate: new Date(),
          durationDays: 1,
        } as any,
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      );

      expect(tournamentRepository.findOne).toHaveBeenCalledTimes(2);
      expect(tournamentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: expect.any(String) }),
      );
    });
  });

  describe('createTeamAndRegister', () => {
    const dto = { teamName: 'Team A', captainId: captainId.toString() };

    it('rejects when caller is not the captain', async () => {
      await expect(
        service.createTeamAndRegister(tournamentId.toString(), dto as any, 'someone-else'),
      ).rejects.toThrow(CustomHttpException);
    });

    it('rejects when tournament is not in registration phase', async () => {
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.STARTED, maxTeams: 8, registeredTeams: [] }),
      );

      await expect(
        service.createTeamAndRegister(tournamentId.toString(), dto as any, captainId.toString()),
      ).rejects.toThrow('Tournament is not in registration phase');
    });

    it('rejects when tournament is full', async () => {
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, maxTeams: 1, registeredTeams: [new Types.ObjectId()] }),
      );

      await expect(
        service.createTeamAndRegister(tournamentId.toString(), dto as any, captainId.toString()),
      ).rejects.toThrow('Tournament is full');
    });

    it('rejects when the captain is already on another team in this tournament', async () => {
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, maxTeams: 8, registeredTeams: [] }),
      );
      userRepository.findOne.mockResolvedValue({ _id: captainId });
      teamRepository.findRaw.mockReturnValue(chainable({ _id: new Types.ObjectId() }));

      await expect(
        service.createTeamAndRegister(tournamentId.toString(), dto as any, captainId.toString()),
      ).rejects.toThrow('You are already registered to a team in this tournament');
    });

    it('creates a team with only the captain, a code, and tournamentId', async () => {
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, maxTeams: 8, registeredTeams: [], registrationFee: 0 }),
      );
      userRepository.findOne.mockResolvedValue({ _id: captainId });
      teamRepository.findRaw.mockReturnValue(chainable(null)); // conflictingTeam check — no match
      teamRepository.findOne.mockResolvedValue(null); // code uniqueness check passes first try
      teamRepository.create.mockResolvedValue({ _id: teamId, code: 'ABC123' });

      const result = await service.createTeamAndRegister(
        tournamentId.toString(),
        dto as any,
        captainId.toString(),
      );

      expect(teamRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          captain: captainId.toString(),
          players: [captainId.toString()],
          code: expect.any(String),
          tournamentId: expect.any(Types.ObjectId),
        }),
      );
      expect(result).toEqual({ _id: teamId, code: 'ABC123' });
    });
  });

  describe('findByCode', () => {
    it('returns the tournament for a matching code', async () => {
      tournamentRepository.findRaw.mockReturnValue(chainable({ _id: tournamentId, code: 'ABC123' }));

      await expect(service.findByCode('abc123')).resolves.toEqual({ _id: tournamentId, code: 'ABC123' });
    });

    it('throws 404 when no tournament matches', async () => {
      tournamentRepository.findRaw.mockReturnValue(chainable(null));

      await expect(service.findByCode('NOPE12')).rejects.toThrow('Tournament not found');
    });
  });

  describe('joinTeamByCode', () => {
    const dto = { code: 'abc123' };

    it('rejects an invalid code', async () => {
      teamRepository.findOne.mockResolvedValue(null);

      await expect(service.joinTeamByCode(dto, 'user1')).rejects.toThrow('Invalid team code');
    });

    it('rejects when the team is no longer registered to a tournament', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, playersPerTeam: 5, registeredTeams: [] }),
      );

      await expect(service.joinTeamByCode(dto, 'user1')).rejects.toThrow(
        'Team is no longer registered to a tournament',
      );
    });

    it('rejects when the tournament is not in registration phase', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.STARTED, playersPerTeam: 5, registeredTeams: [teamId] }),
      );

      await expect(service.joinTeamByCode(dto, 'user1')).rejects.toThrow('Tournament is not in registration phase');
    });

    it('rejects when the caller is already on this team', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, playersPerTeam: 5, registeredTeams: [teamId] }),
      );

      await expect(service.joinTeamByCode(dto, captainId.toString())).rejects.toThrow('You are already on this team');
    });

    it('rejects when the team is full', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, playersPerTeam: 1, registeredTeams: [teamId] }),
      );

      await expect(service.joinTeamByCode(dto, 'user1')).rejects.toThrow('Team is full');
    });

    it('rejects when the caller is already on a different team in this tournament', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, playersPerTeam: 5, registeredTeams: [teamId] }),
      );
      teamRepository.findRaw.mockReturnValue(chainable({ _id: new Types.ObjectId() }));

      await expect(service.joinTeamByCode(dto, 'user1')).rejects.toThrow(
        'You are already registered to a team in this tournament',
      );
    });

    it('adds the caller to the team on success', async () => {
      teamRepository.findOne.mockResolvedValue({
        _id: teamId,
        tournamentId,
        players: [captainId],
      });
      tournamentRepository.findRaw.mockReturnValue(
        chainable({ status: TournamentStatus.REGISTRATION, playersPerTeam: 5, registeredTeams: [teamId] }),
      );
      teamRepository.findRaw.mockReturnValue(chainable(null));
      teamRepository.findOneAndUpdate.mockResolvedValue({ _id: teamId, players: [captainId, 'user1'] });

      await service.joinTeamByCode(dto, 'user1');

      expect(teamRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: teamId },
        { $addToSet: { players: 'user1' } },
      );
    });
  });

  describe('leaveTeam', () => {
    it('throws when the caller is not on any team', async () => {
      teamRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveTeam('user1')).rejects.toThrow('You are not on any team');
    });

    it('rejects the captain leaving via this route', async () => {
      teamRepository.findOne.mockResolvedValue({ _id: teamId, captain: captainId, tournamentId });

      await expect(service.leaveTeam(captainId.toString())).rejects.toThrow(
        'Captain cannot leave the team — unregister the team instead',
      );
    });

    it('rejects once the tournament has left registration', async () => {
      teamRepository.findOne.mockResolvedValue({ _id: teamId, captain: captainId, tournamentId });
      tournamentRepository.findRaw.mockReturnValue(chainable({ status: TournamentStatus.STARTED }));

      await expect(service.leaveTeam('user1')).rejects.toThrow('Cannot leave after tournament has started');
    });

    it('removes the caller from the team on success', async () => {
      teamRepository.findOne.mockResolvedValue({ _id: teamId, captain: captainId, tournamentId });
      tournamentRepository.findRaw.mockReturnValue(chainable({ status: TournamentStatus.REGISTRATION }));
      teamRepository.findOneAndUpdate.mockResolvedValue({ _id: teamId });

      await service.leaveTeam('user1');

      expect(teamRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: teamId },
        { $pull: { players: 'user1' } },
      );
    });
  });
});
