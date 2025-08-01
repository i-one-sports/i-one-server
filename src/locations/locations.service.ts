import { Injectable, HttpStatus } from '@nestjs/common';
import { LocationRepository } from './locations.repository';
import { UserRepository } from '../users/users.repository';
import { CustomHttpException, Location } from '@app/common';
import { CreateLocationDto, ViewNearbyLocationsDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly locationRepository: LocationRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async registerLocation(locationData: CreateLocationDto): Promise<Location> {
    const { name, address, location } = locationData;

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

    return await this.locationRepository.create({ name, address, location });
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
            coordinates: [lng,lat],
          },
          // $maxDistance: 5000,
        },
      },
    });
  }

  async getMyLocation(userId: string) {
    const user = await this.userRepository.findOne({ _id: userId });

    if (!user) {
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const location = user.locationInfo;
    const address = user.locationInfo.address;
    const coordinates = user.locationInfo.location.coordinates;

    return { locationInfo: location, address, coordinates };
  }
}
