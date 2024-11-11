// Marking as server component (default in Next.js App Router)
import { ParkingDetails } from '@/components/parking/parking-details'
import { ReservationSummary } from '@/components/parking/reservation-summary'
import { ImageCarousel } from '@/components/parking/image-carousel'
import { ParkingFeatures } from '@/components/parking/parking-features'
import { ParkingReviews } from '@/components/parking/parking-reviews'
import { NearbyLocations } from '@/components/parking/nearby-locations'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ParkingDetailPage({ params }: PageProps) {
  // Await the params since it's a Promise
  const id = (await params).id

  // Here you would fetch parking data server-side
  // const parkingData = await fetchParkingData(id)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <h1>Parking Details {id}</h1>
          <ParkingDetails />
          <ImageCarousel />
          <ParkingFeatures />
          <ParkingReviews />
          <NearbyLocations />
        </div>

        {/* Sidebar - Takes up 1 column */}
        <div className="lg:col-span-1">
          <ReservationSummary />
        </div>
      </div>
    </div>
  )
}
