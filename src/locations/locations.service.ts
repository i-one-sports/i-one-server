import { Injectable, HttpStatus } from '@nestjs/common';
import { LocationRepository } from './locations.repository';
import { UserRepository } from '../users/users.repository';
import { CustomHttpException, IsOwner, Location } from '@app/common';
import { MatchRepository } from '../matches/matches.repository';
import { CreateLocationDto, UpdatePitchConditionDto, ViewNearbyLocationsDto } from './dto/location.dto';
import { handleError } from 'src/helpers/errorHandler';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { Types } from 'mongoose';

@Injectable()
export class LocationsService {
  constructor(
    private readonly locationRepository: LocationRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly userRepository: UserRepository,
    private readonly matchRepository: MatchRepository,
    private readonly sessionPaymentService: SessionPaymentService,
  ) {}

  async registerLocation(locationData: CreateLocationDto, ownerId: Types.ObjectId): Promise<Location> {
    const { name, address, location, pitchPhoto } = locationData;

    const alreadyExists = await this.locationRepository.findOne({
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: location.coordinates,
          },
          $maxDistance: 1,
        },
      },
    });

    if (alreadyExists) {
      throw new CustomHttpException(
        'Location already registered',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const payload: any = {
        name,
        address,
        location: {
          type: 'Point',
          coordinates: location.coordinates,
        },
        pitchPhoto,
        owner: ownerId,
      };
     
      return await this.locationRepository.create(payload);
    } catch (error) {
      if (error.code === 11000) {
        throw new CustomHttpException(
          'Location with this name already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async viewAllLocations(): Promise<Location[]> {
    return await this.locationRepository.find({});
  }

  async viewNearbyLocations(lng: number, lat: number) {
    return await this.locationRepository.find({
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          // $maxDistance: 5000,
        },
      },
    });
  }

  async findMatchesByLocation(locationId: string, skip = 0, limit = 20) {
    return await this.sessionRepository.findMatchesByLocation(locationId, skip, limit);
  }

  async getOwnerDashboard(locationId: string, ownerId: string) {
    // verify location exists and ownership
    const location = await this.locationRepository.findOne({ _id: locationId });
    if (!location) {
      throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);
    }

    // If location has an owner field, verify; otherwise rely on passed ownerId
    if (location.owner && location.owner.toString() !== ownerId) {
      throw new CustomHttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // compose dashboard
    const pitchCondition = location.pitchCondition || 'Good';
    const pitchPhoto = location.pitchPhoto || null;
    const address = location.address;
    const openingHour = location.openingHour || null;
    const closingHour = location.closingHour || null;

    const lastMatchesRaw = await this.sessionRepository.findMatchesByLocation(locationId);
    // extract and flatten matches, sort by createdAt desc, limit 5
    const matches: any[] = [];
    for (const s of lastMatchesRaw) {
      if (Array.isArray(s.matches)) {
        for (const m of s.matches) matches.push(m);
      }
    }
    const lastMatches = matches
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    const visitorCount = await this.sessionRepository.findVisitorCountByLocation(locationId);

    const upcomingSessions = await this.sessionRepository.findUpcomingSessionsByLocation(locationId, 20);

    return {
      pitchCondition,
      pitchPhoto,
      address,
      openingHour,
      closingHour,
      lastMatches,
      visitorCount,
      upcomingSessions,
    };
  }

  private async verifyOwnership(locationId: string, ownerId: string) {
    const location = await this.locationRepository.findOne({ _id: locationId });
    if (!location) {
      throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);
    }
    if (location.owner && location.owner.toString() !== ownerId) {
      throw new CustomHttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return location;
  }

  async getOwnerSummary(locationId: string, ownerId: string) {
    const location = await this.verifyOwnership(locationId, ownerId);
    return {
      pitchCondition: location.pitchCondition || 'Good',
      pitchPhoto: location.pitchPhoto || null,
      address: location.address,
      openingHour: location.openingHour || null,
      closingHour: location.closingHour || null,
    };
  }

  async getOwnerLastMatches(locationId: string, ownerId: string, limit = 5, skip = 0) {
    await this.verifyOwnership(locationId, ownerId);
    return this.sessionRepository.findMatchesByLocation(locationId, skip, limit);
  }

  async getVisitorCount(locationId: string, ownerId: string) {
    await this.verifyOwnership(locationId, ownerId);
    return this.sessionRepository.findVisitorCountByLocation(locationId);
  }

  async getUpcomingSessions(locationId: string, ownerId: string, limit = 20, skip = 0) {
    await this.verifyOwnership(locationId, ownerId);
    return this.sessionRepository.findUpcomingSessionsByLocation(locationId, limit, skip);
  }

  async getRevenue(locationId: string, ownerId: string) {
    await this.verifyOwnership(locationId, ownerId);
    return this.sessionPaymentService.getRevenueByLocation(locationId);
  }

  async getUsersChart(locationId: string, ownerId: string) {
    await this.verifyOwnership(locationId, ownerId);
    const data = await this.sessionRepository.getUsersChartByLocation(locationId);
    const total = data.reduce((sum, d) => sum + d.count, 0);
    return { total, data };
  }

  



  async updatePitchCondition(locationId: string, ownerId: string, dto: UpdatePitchConditionDto) {
    await this.verifyOwnership(locationId, ownerId);

    const updated = await this.locationRepository.findOneAndUpdate(
      { _id: locationId },
      { pitchCondition: dto.pitchCondition },
    );

    return { message: 'Pitch condition updated', location: updated };
  }

  async getMyLocation(userId: Types.ObjectId) {
    console.log(userId)
    const location = await this.locationRepository.findOne({ owner: userId });
    if (!location) {
      throw new CustomHttpException('No location found for this user', HttpStatus.NOT_FOUND);
    }

 
    return location;
  }

  async getLocationById(locationId: string): Promise<Location> {
    try {
      const location = await this.locationRepository.findOne({
        _id: locationId,
      });
      if (!location) {
        throw new CustomHttpException(
          'Location not found',
          HttpStatus.NOT_FOUND,
        );
      }
      return location;
    } catch (error: any) {
      handleError(error, 'Failed to get location by ID');
    }
  }
}
