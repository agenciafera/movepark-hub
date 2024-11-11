import { Button } from '@/components/ui/button'
import { ChevronDownIcon } from 'lucide-react'

export function ReservationSummary() {
  return (
    <div className="bg-white p-6 rounded-lg border space-y-6">
      <div>
        <h2 className="font-medium mb-4">Summary</h2>
        <div className="space-y-2">
          <h3 className="font-semibold">INDIGO Harlay Pont Neuf</h3>
          <div className="flex justify-between items-center">
            <span>2 hours</span>
            <span>8.50 €</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center">
          <span className="font-medium">Total</span>
          <span className="text-[#DA455E] text-xl font-semibold">8.50 €</span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg text-sm">
        <p>
          Remember that you can cancel/modify your reservation as long as
          it&apos;s before 09:00 on 12/11/2024 by clicking on My Purchases in
          your profile
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-medium">Unlimited pass</h3>
          <p className="text-sm text-muted-foreground">
            UNLIMITED ENTRY AND EXIT
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm">Arrival</span>
            <span className="text-sm">Tue, 12 Nov. 10:00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm">Departure</span>
            <span className="text-sm">Tue, 12 Nov. 12:00</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm">Vehicle</span>
            <span className="text-sm">Car</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm">Maximum height of the car park</span>
            <span className="text-sm">1.91m</span>
          </div>
        </div>

        <Button variant="outline" className="w-full">
          Car park features
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
