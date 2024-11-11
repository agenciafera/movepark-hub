'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ReservationSummary() {
  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>Reservation details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Unlimited pass</span>
            <span className="font-semibold">9.40 €</span>
          </div>
          <p className="text-sm text-gray-500">This product is of 2 hours</p>
        </div>

        <div className="space-y-2">
          <div className="text-sm">
            <p className="font-semibold">From</p>
            <p>Mon, 11 Nov 10:00</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Until</p>
            <p>Mon, 11 Nov 12:00</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm">
            <p className="font-semibold">Vehicle</p>
            <p>Car</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Maximum height of the car</p>
            <p>1.85m</p>
          </div>
        </div>

        <div className="pt-4">
          <Button className="w-full bg-rosinha hover:bg-rosinha/90">
            Continue
          </Button>
          <p className="text-sm text-center mt-2">Free cancellation</p>
        </div>
      </CardContent>
    </Card>
  )
}
