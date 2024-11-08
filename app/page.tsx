"use client"

import { SearchBar } from "@/components/search/search-bar"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="mb-8 flex flex-col items-center space-y-4 text-center">
        <h1 className="text-4xl font-bold">Movepark Hub</h1>
        <p className="text-xl text-gray-600">Select what type of parking you&apos;re looking for:</p>
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
          // Here you would typically navigate to the results page with the search params
          console.log(params)
        }}
      />
    </main>
  )
}
