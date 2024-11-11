'use client'

import { ParkingSpot } from '@/types/parking'
import { useRouter } from 'next/navigation'

interface ParkingListProps {
  spots: ParkingSpot[]
  selectedSpot: ParkingSpot | null
  onSpotSelect: (spot: ParkingSpot) => void
}

export function ParkingList({
  spots,
  selectedSpot,
  onSpotSelect,
}: ParkingListProps) {
  const router = useRouter()

  const handleDetailsClick = (e: React.MouseEvent, spot: ParkingSpot) => {
    e.stopPropagation() // Prevent the parent onClick from firing
    router.push(`/parking/${spot.id}`)
  }

  return (
    <div className="space-y-4">
      {spots.map((spot) => (
        <div
          key={spot.id}
          onClick={() => onSpotSelect(spot)}
          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
            selectedSpot?.id === spot.id
              ? 'border-rosinha-500 bg-rosinha-50'
              : 'border-gray-200 hover:border-rosinha-300'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">{spot.name}</h3>
              <p className="text-sm text-gray-600">{spot.address}</p>
              <p className="text-sm text-gray-600">
                {(spot.distanceInMeters / 1000).toFixed(1)} km away
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">${spot.price}</p>
              <button
                onClick={(e) => handleDetailsClick(e, spot)}
                className="mt-2 px-4 py-2 text-sm bg-rosinha-500 text-white rounded-md hover:bg-rosinha-600 transition-colors"
              >
                Details
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
