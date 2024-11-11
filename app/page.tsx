'use client'

import { SearchBar } from '@/components/search/search-bar'
import { Features } from '@/components/home/features'
import { KPIs } from '@/components/home/kpis'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <main>
      {/* Hero Section */}
      <section className="relative flex h-screen flex-col items-center justify-center">
        {/* Background Image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="/background.webp"
            alt="Parking background"
            fill
            className="object-cover brightness-75"
            priority
          />
        </div>

        <div className="mb-8 flex flex-col items-center space-y-4 text-center px-4">
          <h1 className="text-4xl font-bold text-white">
            Find your perfect parking spot
          </h1>
          <p className="text-xl text-gray-200">
            Select what type of parking you&apos;re looking for:
          </p>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-4 px-4">
          <button className="rounded-full bg-roxo-move/10 px-6 py-2 text-roxo-move">
            Tickets
          </button>
          <button className="rounded-full bg-azul-escuro/10 px-6 py-2 text-azul-escuro">
            Monthly subscription
          </button>
          <button className="rounded-full bg-rosinha/10 px-6 py-2 text-rosinha">
            Airport
          </button>
        </div>

        <div className="w-full max-w-5xl px-4">
          <SearchBar
            onSearch={(params) => {
              const searchParams = new URLSearchParams({
                location: params.location,
                arrival: params.arrival.date?.toISOString() || '',
                'arrival.time': params.arrival.time,
                departure: params.departure.date?.toISOString() || '',
                'departure.time': params.departure.time,
              })
              router.push(`/results?${searchParams.toString()}`)
            }}
          />
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            <Features />
            <div className="relative aspect-[4/3] lg:aspect-[3/4]">
              <Image
                src="https://placehold.co/800x1000.jpg"
                alt="Woman getting out of a car"
                fill
                className="rounded-2xl object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* KPIs Section */}
      <KPIs />
    </main>
  )
}
