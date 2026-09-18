import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

/**
 * Web app manifest. Generated from the brand configuration so the installed
 * app always matches the in-app branding.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.shortName,
    description: brand.description,
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: brand.backgroundColor,
    theme_color: brand.themeColor,
    lang: 'en-ZA',
    dir: 'ltr',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Scan a slip',
        short_name: 'Scan',
        description: 'Capture a receipt with your camera',
        url: '/scan?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'My Slips',
        short_name: 'Slips',
        description: 'Browse everything you have filed',
        url: '/slips?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
