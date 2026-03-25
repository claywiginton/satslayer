import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PROOF OF WORK — Mine Bitcoin With Your Body',
  description: 'Earn sats for completing daily fitness challenges and hitting weight loss goals',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
