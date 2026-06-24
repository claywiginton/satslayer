import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'PROOF OF WORK',
  description: 'Earn sats for completing daily fitness challenges and hitting weight loss goals',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Proof of Work',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#08080a" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/app-icon-1024.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
