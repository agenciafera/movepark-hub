'use client'

import { Star } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { Review } from '@/types/parking'

export function ParkingReviews() {
  const reviews: Review[] = [
    {
      id: '1',
      author: 'Carol Jan',
      date: '2024-03-15',
      rating: {
        access: 5,
        facilities: 4,
        staff: 5,
      },
      comment:
        'Het was een hele klus om met de papieren te werken wat men moet doen bij binnenkomst van de garage. Uiteindelijk met een (erg) kaart gekregen, die bij vertrek niet bleek te werken. kortom vervelend naar het personeel terug!',
    },
    // Add more reviews as needed
  ]

  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Reviews</h2>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">4.3</span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= 4
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-yellow-100 text-yellow-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {reviews.map((review) => (
          <div key={review.id} className="border-b pb-4">
            <div className="flex justify-between mb-2">
              <span className="font-medium">{review.author}</span>
              <span className="text-sm text-gray-500">{review.date}</span>
            </div>
            <p className="text-gray-600">{review.comment}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
