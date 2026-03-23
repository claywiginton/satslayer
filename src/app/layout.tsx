import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SATSLAYER — Bitcoin Bounty Weight Loss',
  description: 'Earn sats for crushing daily challenges and dropping weight',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
