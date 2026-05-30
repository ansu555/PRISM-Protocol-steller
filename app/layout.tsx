import React from "react"
import type { Metadata } from 'next'
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const instrumentSans = Instrument_Sans({ 
  subsets: ["latin"],
  variable: '--font-instrument'
});

const instrumentSerif = Instrument_Serif({ 
  subsets: ["latin"],
  weight: "400",
  variable: '--font-instrument-serif'
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

export const metadata: Metadata = {
  title: {
    template: '%s | PRISM Protocol',
    default: 'PRISM Protocol | Programmable Credit on Stellar',
  },
  description: 'Tranche credit risk into Prime, Core, and Alpha. Trade tranche tokens on a live AMM. Watch losses cascade in real time.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '64x64' },
      { url: '/icon-light-64x64.png', media: '(prefers-color-scheme: light)', sizes: '64x64', type: 'image/png' },
      { url: '/icon-dark-64x64.png', media: '(prefers-color-scheme: dark)', sizes: '64x64', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        suppressHydrationWarning
        className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
