'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LockIcon } from 'lucide-react'

export function UserDetailsForm() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Quick access</h2>
        <p className="text-sm text-muted-foreground">
          Register or access your account in just 1 click
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            variant="outline"
            className="flex-1 bg-[#4267B2] text-white hover:bg-[#4267B2]/90"
          >
            Continue with Facebook
          </Button>
          <Button variant="outline" className="flex-1">
            Continue with Google
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">My details</h2>
        <p className="text-sm text-muted-foreground">*Mandatory field</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input placeholder="Name" />
          <Input placeholder="Last Name" />
          <Input placeholder="City of residence" />
          <Input placeholder="Email" />
          <div className="flex gap-4">
            <Select defaultValue="+44">
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Prefix" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="+44">+44 Guernsey</SelectItem>
                {/* Add more country codes */}
              </SelectContent>
            </Select>
            <Input placeholder="Phone" className="flex-1" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox id="reservation-for-other" />
          <Label htmlFor="reservation-for-other">
            The reservation is for another person
          </Label>
        </div>

        <div className="flex items-start space-x-2 bg-slate-50 p-4 rounded-lg">
          <LockIcon className="h-4 w-4 mt-1" />
          <div>
            <p className="text-sm">Your data is safe.</p>
            <Button variant="link" className="h-auto p-0 text-sm">
              More information
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Additional details</h2>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="rental-car" />
            <Label htmlFor="rental-car">Rental car</Label>
          </div>
          <Input placeholder="Vehicle registration number" />
          <p className="text-sm text-muted-foreground">Example: 1234ABC</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="terms" />
            <Label htmlFor="terms">I accept the Terms and conditions</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="marketing" />
            <Label htmlFor="marketing">
              I want to receive news and promotions from Parclick (don&apos;t
              worry, we&apos;re not spam! We&apos;ll only inform you of
              what&apos;s important).
            </Label>
          </div>
        </div>
      </div>

      <Button className="w-full">Payment Review</Button>
    </div>
  )
}
