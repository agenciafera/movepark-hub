'use client'

import { Car, Clock, Shield, Umbrella } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function ParkingFeatures() {
  const features = [
    {
      icon: Car,
      title: 'Guaranteed parking space',
      description: 'Your space is reserved just for you',
    },
    {
      icon: Clock,
      title: '24h service',
      description: 'Access your vehicle any time',
    },
    {
      icon: Umbrella,
      title: 'Covered parking',
      description: 'Protected from weather conditions',
    },
    {
      icon: Shield,
      title: 'Maximum height allowed',
      description: '1.85m',
    },
  ]

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-xl font-semibold mb-4">Features</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <feature.icon className="w-5 h-5 text-roxo-move mt-1" />
            <div>
              <h3 className="font-medium">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
