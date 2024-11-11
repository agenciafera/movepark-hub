'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'

export function Navigation() {
  const pathname = usePathname()
  const isTransparent = pathname === '/'

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 ${
        isTransparent ? 'bg-transparent' : 'bg-white border-b border-gray-200'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo_white.svg"
              alt="Movepark"
              width={116}
              height={18}
              className={isTransparent ? 'block' : 'hidden'}
            />
            <Image
              src="/logo_dark.svg"
              alt="Movepark"
              width={116}
              height={18}
              className={isTransparent ? 'hidden' : 'block'}
            />
          </Link>

          {/* Login Button */}
          <Button
            variant={isTransparent ? 'secondary' : 'default'}
            className={isTransparent ? 'bg-white/10 hover:bg-white/20' : ''}
          >
            Login
          </Button>
        </div>
      </div>
    </nav>
  )
}
