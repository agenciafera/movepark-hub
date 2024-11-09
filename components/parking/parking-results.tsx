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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
      <div className="overflow-y-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">
            {results.length} results for 2 hours
          </h1>
        </div>
        <ParkingList 
          spots={results} 
          onSpotSelect={setSelectedSpot}
          selectedSpot={selectedSpot}
        />
      </div>
      <div className="h-full sticky top-0">
        <ParkingMap 
          spots={results}
          selectedSpot={selectedSpot}
          onSpotSelect={setSelectedSpot}
        />
      </div>
    </div>
  )
} 