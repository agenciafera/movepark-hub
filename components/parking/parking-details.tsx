'use client'

import { Badge } from '@/components/ui/badge'
import { StarRating } from './star-rating'

export function ParkingDetails() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-azul-escuro">
          SAEMES Lagrange-Maubert Car park
        </h1>
        <div className="flex items-center gap-2">
          <StarRating rating={4.3} />
          <Badge variant="secondary">8 min</Badge>
        </div>
      </div>

      {/* Quick Info */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Contactless access</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Free cancellation</Badge>
        </div>
      </div>

      {/* Opening Hours */}
      <div className="space-y-2">
        <h2 className="font-semibold">Car park hours</h2>
        <p>Open 24 hours a day</p>
      </div>

      {/* Details */}
      <div className="space-y-2">
        <h2 className="font-semibold">Details</h2>
        <p className="text-gray-600">
          Car park details: The Lagrange-Maubert car park is located at the
          intersection between Avenue Saint-Germain and Rue Lagrange, which is a
          coveted location for parking close to the Maison de la Mutualité, the
          Sorbonne and the Arab World Institute.
        </p>
        <button className="text-roxo-move hover:underline">View more</button>
      </div>
    </div>
  )
}
