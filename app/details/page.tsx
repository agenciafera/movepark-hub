import { UserDetailsForm } from '@/components/details/user-details-form'
import { ReservationSummary } from '@/components/details/reservation-summary'
import { Steps } from '@/components/ui/steps'

export default function DetailsPage() {
  const steps = [
    {
      title: 'Car park',
      isCompleted: true,
      isCurrent: false,
    },
    {
      title: 'My details',
      isCompleted: false,
      isCurrent: true,
    },
    {
      title: 'Payment Review',
      isCompleted: false,
      isCurrent: false,
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8 pt-24">
      <Steps steps={steps} />
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold mb-6">My details</h1>
          <UserDetailsForm />
        </div>
        <div className="md:w-[400px]">
          <ReservationSummary />
        </div>
      </div>
    </div>
  )
}
