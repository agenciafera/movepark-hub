'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { Calendar as CalendarIcon, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface SearchFormData {
  location: string
  arrival: Date
  departure: Date
}

interface SearchFormProps {
  defaultValues?: Partial<SearchFormData>
}

export function SearchForm({ defaultValues }: SearchFormProps) {
  const router = useRouter()
  const [location, setLocation] = useState(defaultValues?.location || '')
  const [arrival, setArrival] = useState<Date>(defaultValues?.arrival || new Date())
  const [departure, setDeparture] = useState<Date>(defaultValues?.departure || new Date())

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const searchParams = new URLSearchParams({
      location: location,
      arrival: arrival.toISOString(),
      departure: departure.toISOString()
    })

    router.push(`/results?${searchParams.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 items-center">
      <div className="flex-1">
        <Input
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !arrival && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {arrival ? format(arrival, "PPp") : <span>Arrival</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={arrival}
            onSelect={(date) => date && setArrival(date)}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !departure && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {departure ? format(departure, "PPp") : <span>Departure</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={departure}
            onSelect={(date) => date && setDeparture(date)}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Button type="submit">
        <Search className="h-4 w-4" />
      </Button>
    </form>
  )
} 