'use client'

import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format } from 'date-fns'
import { Calendar as CalendarIcon, Clock, MapPin, Search } from 'lucide-react'
import { TimePickerDemo } from './time-picker'

interface SearchParams {
  location: string
  arrival: {
    date: Date | undefined
    time: string
  }
  departure: {
    date: Date | undefined
    time: string
  }
}

interface SearchBarProps {
  onSearch: (searchParams: SearchParams) => void
  defaultValues?: SearchParams
}

export function SearchBar({ onSearch, defaultValues }: SearchBarProps) {
  const [location, setLocation] = useState(defaultValues?.location || '')
  const [arrivalDate, setArrivalDate] = useState<Date | undefined>(
    defaultValues?.arrival.date || undefined,
  )
  const [departureDate, setDepartureDate] = useState<Date | undefined>(
    defaultValues?.departure.date || undefined,
  )
  const [arrivalTime, setArrivalTime] = useState(
    defaultValues?.arrival.time || '10:00',
  )
  const [departureTime, setDepartureTime] = useState(
    defaultValues?.departure.time || '12:00',
  )

  const handleSearch = () => {
    onSearch({
      location,
      arrival: {
        date: arrivalDate,
        time: arrivalTime,
      },
      departure: {
        date: departureDate,
        time: departureTime,
      },
    })
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-full bg-white p-2 shadow-lg">
      <div className="flex flex-1 items-center gap-2 px-4">
        <MapPin className="h-5 w-5 text-gray-500" />
        <Input
          placeholder="Address, place or city"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border-0 bg-transparent focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-4 rounded-full bg-gray-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {arrivalDate
                  ? format(arrivalDate, 'MM/dd/yyyy')
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={arrivalDate}
                onSelect={setArrivalDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Clock className="h-4 w-4" />
                {arrivalTime}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <TimePickerDemo
                selected={arrivalTime}
                onTimeChange={setArrivalTime}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {departureDate
                  ? format(departureDate, 'MM/dd/yyyy')
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={departureDate}
                onSelect={setDepartureDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Clock className="h-4 w-4" />
                {departureTime}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <TimePickerDemo
                selected={departureTime}
                onTimeChange={setDepartureTime}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        onClick={handleSearch}
        size="icon"
        className="rounded-full"
        aria-label="Search for parking"
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  )
}
