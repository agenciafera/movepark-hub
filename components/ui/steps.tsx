interface Step {
  title: string
  isCompleted: boolean
  isCurrent: boolean
}

interface StepsProps {
  steps: Step[]
}

export function Steps({ steps }: StepsProps) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-center">
        {steps.map((step, index) => (
          <div key={step.title} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 
                  ${
                    step.isCompleted
                      ? 'border-green-500 bg-green-500'
                      : step.isCurrent
                        ? 'border-[#DA455E]'
                        : 'border-gray-300'
                  }
                `}
              >
                {step.isCompleted ? (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span
                    className={`text-sm ${
                      step.isCurrent ? 'text-[#DA455E]' : 'text-gray-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                )}
              </div>
              <span
                className={`mt-2 text-sm ${
                  step.isCurrent
                    ? 'text-[#DA455E] font-medium'
                    : 'text-gray-500'
                }`}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-full h-[2px] mx-4 ${
                  step.isCompleted ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
