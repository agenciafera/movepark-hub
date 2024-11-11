'use client'

import { ParkingList } from './parking-list'
import { ParkingMap } from './parking-map'
import { ParkingSpot } from '@/types/parking'
import { useState } from 'react'

interface ParkingResultsProps {
  results: ParkingSpot[]
}

export function ParkingResults({ results }: ParkingResultsProps) {
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)

  const handleSpotSelect = (spot: ParkingSpot) => {
    setSelectedSpot(spot)
  }

  return (
    <>
      {/* List - 1/3 width */}
      <div className="w-1/3 overflow-y-auto border-r">
        <div className="p-4">
          <div className="mb-4">
            <h1 className="text-2xl font-semibold">
              {results.length} results for 2 hours
            </h1>
          </div>
          <ParkingList
            spots={results}
            onSpotSelect={handleSpotSelect}
            selectedSpot={selectedSpot}
          />
        </div>
      </div>

      {/* Map - 2/3 width */}
      <div className="w-2/3">
        <ParkingMap
          spots={results}
          selectedSpot={selectedSpot}
          onSpotSelect={handleSpotSelect}
        />
      </div>
    </>
  )
}
