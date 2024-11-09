"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TimePickerProps {
  selected: string
  onTimeChange: (time: string) => void
}

export function TimePickerDemo({ selected, onTimeChange }: TimePickerProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"))
  const minutes = ["00", "15", "30", "45"]

  const [hour, minute] = selected.split(":")

  return (
    <div className="flex items-end gap-2 p-4">
      <div className="grid gap-2">
        <Label htmlFor="hours">Hours</Label>
        <Select value={hour} onValueChange={(value) => onTimeChange(`${value}:${minute}`)}>
          <SelectTrigger id="hours" className="w-[110px]">
            <SelectValue placeholder="Hours" />
          </SelectTrigger>
          <SelectContent>
            {hours.map((hour) => (
              <SelectItem key={hour} value={hour}>
                {hour}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="minutes">Minutes</Label>
        <Select value={minute} onValueChange={(value) => onTimeChange(`${hour}:${value}`)}>
          <SelectTrigger id="minutes" className="w-[110px]">
            <SelectValue placeholder="Minutes" />
          </SelectTrigger>
          <SelectContent>
            {minutes.map((minute) => (
              <SelectItem key={minute} value={minute}>
                {minute}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
} 