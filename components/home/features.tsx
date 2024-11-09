'use client'

import { Smartphone, Clock, PiggyBank, Lock } from 'lucide-react'

interface Feature {
  icon: React.ReactNode
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: <Smartphone className="h-5 w-5 text-red-500" />,
    title: "More convenient",
    description: "Do it all from your mobile. Enter the app, find parking, and reserve. It's that easy. Oh, and if your plans change, update your reservation."
  },
  {
    icon: <Clock className="h-5 w-5 text-red-500" />,
    title: "Faster",
    description: "Stop stressing, circling, or being late because we always have a spot for you. With Parclick, reserve before you go out and always park on the first try."
  },
  {
    icon: <PiggyBank className="h-5 w-5 text-red-500" />,
    title: "Cheaper",
    description: "No last-minute surprises here. Compare prices, choose the best parking you find, and save every time you park."
  },
  {
    icon: <Lock className="h-5 w-5 text-red-500" />,
    title: "And safer",
    description: "Pay through the app, park only in verified car parks, and if you ever need help, contact us."
  }
]

export function Features() {
  return (
    <div className="flex flex-col gap-8">
      {features.map((feature, index) => (
        <div key={index} className="flex gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-50">
            {feature.icon}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {feature.title}
            </h3>
            <p className="mt-2 text-base text-gray-600 leading-relaxed">
              {feature.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
} 