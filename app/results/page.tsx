'use client'

import { ParkingResults } from '@/components/parking/parking-results'
import { SearchBar } from '@/components/search/search-bar'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import parkingData from '@/mocks/parking-data.json'

interface SearchParams {
  location: string
  arrival: {
    date?: Date
    time: string
  }
  departure: {
    date?: Date
    time: string
  }
}

export default function ResultsPage() {
  const router = useRouter()
  const [results] = useState(parkingData.parkingSpots)
  const [searchParams] = useState(() => {
    // Get URL search params on initial load
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return {
        location: params.get('location') || '',
        arrival: params.get('arrival') || '',
        'arrival.time': params.get('arrival.time') || '10:00',
        departure: params.get('departure') || '',
        'departure.time': params.get('departure.time') || '12:00',
      }
    }
    return {}
  })

  const handleSearch = (params: SearchParams) => {
    const searchParams = new URLSearchParams({
      location: params.location,
      arrival: params.arrival.date?.toISOString() || '',
      'arrival.time': params.arrival.time,
      departure: params.departure.date?.toISOString() || '',
      'departure.time': params.departure.time,
    })
    router.push(`/results?${searchParams.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Search Bar Section */}
      <div className="border-b bg-white">
        <div className="container mx-auto py-4">
          <SearchBar
            onSearch={handleSearch}
            defaultValues={{
              location: searchParams.location || '',
              arrival: {
                date: searchParams.arrival
                  ? new Date(searchParams.arrival)
                  : new Date(),
                time: searchParams['arrival.time'] || '10:00',
              },
              departure: {
                date: searchParams.departure
                  ? new Date(searchParams.departure)
                  : new Date(),
                time: searchParams['departure.time'] || '12:00',
              },
            }}
          />
        </div>
      </div>

      {/* Results Section */}
      <div className="flex-1 flex">
        <ParkingResults results={results} />
      </div>
    </div>
  )
}
