export interface SearchParams {
  location: string;
  arrival: string;
  departure: string;
}

export interface ParkingSpot {
  id: string;
  name: string;
  address: string;
  rating: number;
  price: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  amenities: {
    hasElevator: boolean;
    hasWheelchairAccess: boolean;
    hasCovered: boolean;
    hasContactless: boolean;
  };
  distanceInMeters: number;
} 