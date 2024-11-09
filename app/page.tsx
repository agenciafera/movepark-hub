"use client"

import { SearchBar } from "@/components/search/search-bar"
import { Features } from "@/components/home/features"
import { KPIs } from "@/components/home/kpis"
import Image from "next/image"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  return (
    <main>
      {/* Hero Section */}
      <section className="relative flex min-h-[600px] flex-col items-center justify-center p-24">
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

        <div className="mb-8 flex flex-col items-center space-y-4 text-center">
          <h1 className="text-4xl font-bold text-white">Find your perfect parking spot</h1>
          <p className="text-xl text-gray-200">Select what type of parking you&apos;re looking for:</p>
        </div>
        
        <div className="mb-8 flex gap-4">
          <button className="rounded-full bg-purple-100 px-6 py-2 text-purple-700">
            Tickets
          </button>
          <button className="rounded-full bg-gray-100 px-6 py-2 text-gray-700">
            Monthly subscription
          </button>
          <button className="rounded-full bg-orange-100 px-6 py-2 text-orange-700">
            Airport
          </button>
        </div>

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
