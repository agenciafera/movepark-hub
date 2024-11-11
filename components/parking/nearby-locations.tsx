'use client'

import { Card } from '@/components/ui/card'
import Link from 'next/link'

export function NearbyLocations() {
  const topRatedParks = [
    'Gare Marie Montparnasse',
    'Bastille Place de Clichy',
    'Quai Branly - Tour Eiffel SAEMES',
  ]

  const nearbyPlaces = [
    'Car parks near Hotel Abbatial Saint Germain in Paris',
    'Parking near Notre-Dame Cathedral in Paris | Parclick',
  ]

  return (
    <Card className="mt-6 p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-3">
            Top rated car parks in Paris
          </h2>
          <div className="space-y-2">
            {topRatedParks.map((park, index) => (
              <Link
                key={index}
                href="#"
                className="block text-roxo-move hover:underline"
              >
                {park}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">
            Interesting places and events nearby
          </h2>
          <div className="space-y-2">
            {nearbyPlaces.map((place, index) => (
              <Link
                key={index}
                href="#"
                className="block text-roxo-move hover:underline"
              >
                {place}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
