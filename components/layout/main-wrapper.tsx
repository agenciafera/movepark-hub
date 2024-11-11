'use client'

import { usePathname } from 'next/navigation'

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = pathname === '/'

  return (
    <main className={`min-h-screen ${!isHomePage ? 'pt-16' : ''}`}>
      {children}
    </main>
  )
}
