'use client'

import Image from 'next/image'
import { Card } from '@/components/ui/card'

export function ImageCarousel() {
  const images = [
    '/placeholder-parking-1.jpg',
    '/placeholder-parking-2.jpg',
    '/placeholder-parking-3.jpg',
  ]

  return (
    <Card className="mt-6 p-4">
      <div className="grid grid-cols-3 gap-4">
        {images.map((image, index) => (
          <div key={index} className="relative aspect-[4/3]">
            <Image
              src={`https://placehold.co/400x300?text=Parking+${index + 1}`}
              alt={`Parking view ${index + 1}`}
              fill
              className="object-cover rounded-lg"
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
