'use client'

import { ParkingSpot } from '@/types/parking'
import { 
  Star, 
  Accessibility,
  ArrowUpDown,
  Car, 
  CreditCard 
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ParkingListProps {
  spots: ParkingSpot[]
  selectedSpot: ParkingSpot | null
  onSpotSelect: (spot: ParkingSpot) => void
}

export function ParkingList({ spots, selectedSpot, onSpotSelect }: ParkingListProps) {
  return (
    <div className="space-y-4">
      {spots.map((spot) => (
        <div
          key={spot.id}
          className={cn(
            "p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors",
            selectedSpot?.id === spot.id && "border-primary bg-primary/5"
          )}
          onClick={() => onSpotSelect(spot)}
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">{spot.name}</h3>
              <p className="text-sm text-muted-foreground">{spot.address}</p>
            </div>
            <div className="text-right">
              <div className="font-bold">{spot.price}€</div>
              <div className="text-sm text-muted-foreground">Price for 2 hours</div>
            </div>
          </div>
          
          <div className="mt-2 flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-4 h-4",
                  i < Math.floor(spot.rating) 
                    ? "text-yellow-400 fill-yellow-400" 
                    : "text-gray-300"
                )}
              />
            ))}
            <span className="ml-1 text-sm">{spot.rating}</span>
          </div>

          <div className="mt-2 flex gap-2">
            {spot.amenities.hasElevator && (
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            )}
            {spot.amenities.hasWheelchairAccess && (
              <Accessibility className="w-4 h-4 text-muted-foreground" />
            )}
            {spot.amenities.hasCovered && (
              <Car className="w-4 h-4 text-muted-foreground" />
            )}
            {spot.amenities.hasContactless && (
              <CreditCard className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {spot.distanceInMeters && (
            <div className="mt-2 text-sm text-muted-foreground">
              {(spot.distanceInMeters / 1000).toFixed(1)} km
            </div>
          )}
        </div>
      ))}
    </div>
  )
} 