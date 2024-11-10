'use client'

import Image from 'next/image'

interface KPI {
  value: string
  label: string
}

const kpis: KPI[] = [
  {
    value: "+2300",
    label: "available parkings"
  },
  {
    value: "6",
    label: "countries"
  },
  {
    value: "280",
    label: "cities"
  },
  {
    value: "470",
    label: "airports, ports, and stations"
  }
]

export function KPIs(): JSX.Element {
  return (
    <section 
      className="relative bg-roxo-move text-white"
      aria-label="Key Performance Indicators"
    >
      {/* Top diagonal shape */}
      <div 
        className="absolute top-[-1px] left-0 right-0 h-16 bg-white" 
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 0)' }}
        aria-hidden="true"
      />

      {/* Bottom diagonal shape */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-16 bg-white" 
        style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%, 0 100%)' }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 py-32">
        <div className="max-w-3xl mx-auto lg:ml-[10%] mb-20">
          <h2 className="text-6xl font-bold leading-tight mb-4">
            Estamos presentes nos principais aeroportos do Brasil.
          </h2>
          <h3 className="text-4xl font-bold leading-tight mb-8">
            E queremos chegar ainda mais longe!
          </h3>
          <p className="text-xl leading-relaxed">
            Nosso objetivo é claro: estar ao seu lado em todos os destinos, trazendo comodidade e segurança a cada viagem.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 max-w-6xl mx-auto lg:ml-[10%]">
          {kpis.map((kpi, index) => (
            <div 
              key={index} 
              className="text-center"
              role="region"
              aria-label={`${kpi.label} statistics`}
            >
              <div className="text-7xl font-bold mb-3">
                {kpi.value}
              </div>
              <div className="text-lg">
                {kpi.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phone image */}
      <div 
        className="absolute top-0 right-0 w-72 h-72 mr-[10%] -mt-16"
        aria-hidden="true"
      >
        <Image
          src="https://placehold.co/300x300.jpg"
          alt="Mobile application interface showing parking features"
          width={300}
          height={300}
          className="object-cover rounded-2xl transform rotate-12"
          priority
        />
      </div>
    </section>
  )
} 