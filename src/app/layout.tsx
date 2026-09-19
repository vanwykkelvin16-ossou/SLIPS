import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { brand } from '@/config/brand';
import { appUrl } from '@/lib/app-url';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerManager } from '@/components/pwa/service-worker-manager';
import { NetworkStatusBanner } from '@/components/pwa/network-status-banner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    type: 'website',
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
    siteName: brand.name,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${brand.name} — ${brand.tagline}` }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={jakarta.variable}>
      <body className="min-h-dvh bg-page">
        <a
          href="#main-content"
          className="sr-only-focusable absolute left-4 top-4 z-[100] rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <NetworkStatusBanner />
          {children}
          <ServiceWorkerManager />
        </ToastProvider>
      </body>
    </html>
  );
}
