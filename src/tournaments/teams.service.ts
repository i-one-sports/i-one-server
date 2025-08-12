import { UserRepository } from "src/users/users.repository";
import { TeamRepository } from "./teams.repository";
import { CreateTeamDto, UpdateTeamDto } from "./dto/team.dto";
import { CustomHttpException, Team, User } from "@app/common";
import { HttpStatus, Injectable } from "@nestjs/common";

@Injectable()
export class TeamsService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly teamRepository: TeamRepository
    ){}
    
    async create(dto: CreateTeamDto): Promise<Team> {
        const captain: User = await this.userRepository.findOne({
            _id: dto.captain
        });
        
        if (!captain) {
            throw new CustomHttpException('Captain user not found', HttpStatus.NOT_FOUND);
        }
        
        if (dto.players && dto.players.length > 0) {
            const playerCount = await this.userRepository.findRaw()
            .countDocuments({
                _id: { $in: dto.players }
            });
            
            if (playerCount !== dto.players.length) {
                throw new CustomHttpException('One or more player users not found', HttpStatus.NOT_FOUND);
            }
        }
        
        const team = await this.teamRepository.create({
            ...dto,
            players: dto.players || [],
        });
        
        if (!team.players.includes(captain._id.toString())) {
            const updatedTeam = await this.teamRepository.findOneAndUpdate(
                { _id: team._id }, 
                { $push: { players: captain._id.toString() } }
            );
            return updatedTeam;
        }
        
        return team;
    }
    
    async findAll(): Promise<Team[]> {
        return this.teamRepository.findRaw()
        .find()
        .populate('captain', 'username email')
        .populate('players', 'username email')
        .exec()
    }
    
    
    async findOne(id: string): Promise<Team> {
        const team = await this.teamRepository.findRaw().findById(id)
        .populate('captain', 'username email')
        .populate('players', 'username email')
        .exec()
        
        if (!team) {
            throw new CustomHttpException(`Team with ID ${id} not found`, HttpStatus.NOT_FOUND);
        }
        
        return team;
    }

    async update(id: string, updateTeamDto: UpdateTeamDto): Promise<Team> {
    const team = await this.teamRepository.findOne({
        _id: id
    });
    if (!team) {
      throw new CustomHttpException(`Team with ID ${id} not found`, HttpStatus.NOT_FOUND);
    }

    if (updateTeamDto.captain) {
      const captain = await this.userRepository.findOne({
        _id: updateTeamDto.captain});

      if (!captain) {
        throw new CustomHttpException('Captain user not found', HttpStatus.NOT_FOUND);
      }
    }

    if (updateTeamDto.players && updateTeamDto.players.length > 0) {
      const playerCount = await this.userRepository.findRaw().countDocuments({
        _id: { $in: updateTeamDto.players },
      });

      if (playerCount !== updateTeamDto.players.length) {
        throw new CustomHttpException('One or more player users not found', HttpStatus.NOT_FOUND);
      }
    }

    const updatedTeam = await this.teamRepository.findRaw()
      .findByIdAndUpdate(id, updateTeamDto, { new: true })
      .populate('captain', 'username email')
      .populate('players', 'username email')
      .exec();
    
    return updatedTeam;
  }

  async remove(id: string): Promise<void> {
    const result = await this.teamRepository.findRaw().deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new CustomHttpException(`Team with ID ${id} not found`, HttpStatus.NOT_FOUND);
    }
  }

  async addPlayer(teamId: string, userId: string): Promise<Team> {
    const team: Team = await this.teamRepository.findOne({
        _id: teamId
    });
    if (!team) {
      throw new CustomHttpException(`Team with ID ${teamId} not found`, HttpStatus.NOT_FOUND);
    }

    const user = await this.userRepository.findOne({
        _id: userId
    })
    ;
    if (!user) {
      throw new CustomHttpException(`User with ID ${userId} not found`, HttpStatus.NOT_FOUND);
    }

    if (team.players.includes(userId)) {
      throw new CustomHttpException('Player already in team', HttpStatus.BAD_REQUEST);
    }

    const updatedTeam = await this.teamRepository.findOneAndUpdate(
        { _id: team._id }, 
        { $push: { players: userId } }
    );
    return updatedTeam;
  }

  async removePlayer(teamId: string, userId: string): Promise<Team> {
    const team: Team = await this.teamRepository.findOne({
        _id: teamId
  });
  if (!team) {
      throw new CustomHttpException(`Team with ID ${teamId} not found`, HttpStatus.NOT_FOUND);
    }
    
    if (team.captain.toString() === userId) {
      throw new CustomHttpException('Cannot remove captain from team', HttpStatus.BAD_REQUEST);
    }

    return await this.teamRepository.findOneAndUpdate(
        { _id: team._id },
        { 
            $pull: { players: userId }
        }
    )
  }

  async getTeamsByUserId(userId: string): Promise<Team[]> {
    return this.teamRepository.findRaw().find({
      $or: [
        { captain: userId },
        { players: userId }
      ]
    })
    .populate('captain', 'username email')
    .populate('players', 'username email')
    .exec();
  }
}