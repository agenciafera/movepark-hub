export interface SearchParams {
  location: string
  arrival: string
  departure: string
}

export interface ParkingSpot {
  id: string
  name: string
  address: string
  rating: number
  price: number
  coordinates: {
    lat: number
    lng: number
  }
  amenities: {
    hasElevator: boolean
    hasWheelchairAccess: boolean
    hasCovered: boolean
    hasContactless: boolean
  }
  distanceInMeters: number
}

export interface Review {
  id: string
  author: string
  date: string
  rating: {
    access: number
    facilities: number
    staff: number
  }
  comment: string
}

export interface ParkingLot {
  id: string
  name: string
  address: string
  rating: number
  distance: string
  features: {
    contactlessAccess: boolean
    freeCancellation: boolean
    hours: string
  }
  details: string
  images: string[]
  pricing: {
    amount: number
    currency: string
    duration: string
  }
  maxHeight: string
  reviews: Review[]
}
