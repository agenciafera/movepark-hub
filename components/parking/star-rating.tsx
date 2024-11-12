'use client'

import { Star } from 'lucide-react'

interface StarRatingProps {
  rating: number
  maxRating?: number
  className?: string
  showScore?: boolean
}

export function StarRating({
  rating,
  maxRating = 5,
  className = '',
  showScore = true,
}: StarRatingProps) {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 !== 0

  return (
    <div className={`flex items-center ${className}`}>
      {showScore && (
        <span className="text-lg font-semibold mr-1">{rating.toFixed(1)}</span>
      )}
      {Array.from({ length: maxRating }).map((_, index) => {
        if (index < fullStars) {
          return (
            <Star
              key={index}
              className="w-4 h-4 fill-yellow-400 text-yellow-400"
            />
          )
        } else if (index === fullStars && hasHalfStar) {
          return (
            <Star
              key={index}
              className="w-4 h-4 fill-yellow-200 text-yellow-400"
            />
          )
        }
        return (
          <Star
            key={index}
            className="w-4 h-4 fill-yellow-100 text-yellow-400"
          />
        )
      })}
    </div>
  )
}
