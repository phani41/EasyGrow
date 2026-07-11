import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://easygrow-zs8n.onrender.com';

export const metadata: Metadata = {
  title: {
    default: 'EasyGrow - AI-Powered CSV Importer',
    template: '%s | EasyGrow',
  },
  description:
    'Intelligently import CSV data into your CRM using AI-powered column mapping. Smart field detection, error handling, and batch processing included.',
  keywords: [
    'CSV import',
    'CRM',
    'AI mapping',
    'data import',
    'EasyGrow',
    'OpenRouter',
    'column mapping',
  ],
  authors: [{ name: 'EasyGrow' }],
  creator: 'EasyGrow',
  publisher: 'EasyGrow',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'EasyGrow',
    title: 'EasyGrow - AI-Powered CSV Importer',
    description:
      'Upload any CSV file and let AI intelligently map your columns to our CRM schema. Smart field detection, error handling, and batch processing included.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'EasyGrow - AI-Powered CSV Importer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EasyGrow - AI-Powered CSV Importer',
    description:
      'Upload any CSV file and let AI intelligently map your columns to our CRM schema.',
    images: ['/og-image.png'],
    creator: '@easygrow',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to font origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className={cn(inter.variable, 'font-sans antialiased')}>
        {/* Skip-to-content link for keyboard and screen reader users */}
        <a
          href="#main-content"
          className="fixed -top-40 left-4 z-[100] rounded-b-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all focus:top-0 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
