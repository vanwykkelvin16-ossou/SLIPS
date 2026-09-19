// Permit only the configured private storage hosts for signed uploads/previews.
const storageOrigins = [];
if (process.env.S3_ENDPOINT) {
  const endpoint = new URL(process.env.S3_ENDPOINT);
  storageOrigins.push(endpoint.origin);
  if (process.env.S3_FORCE_PATH_STYLE !== 'true' && process.env.S3_BUCKET) {
    storageOrigins.push(`${endpoint.protocol}//${process.env.S3_BUCKET}.${endpoint.host}`);
  }
} else if (process.env.S3_BUCKET && process.env.S3_REGION) {
  storageOrigins.push(`https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`);
  if (process.env.S3_FORCE_PATH_STYLE === 'true') storageOrigins.push(`https://s3.${process.env.S3_REGION}.amazonaws.com`);
}
const storageSources = storageOrigins.join(' ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${storageSources}`,
      "font-src 'self' data:",
      `connect-src 'self' ${storageSources}`,
      `frame-src 'self' ${storageSources}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    outputFileTracingIncludes: {
      '/api/receipts/*/process': ['./node_modules/@tesseract.js-data/eng/**/*'],
    },
    /*
     * These packages ship worker scripts, native binaries or their own asset
     * paths and must stay in node_modules rather than being bundled — otherwise
     * they cannot resolve their own files at runtime in a production build.
     */
    serverComponentsExternalPackages: ['tesseract.js', 'sharp', 'pdfjs-dist', 'archiver', 'exceljs', 'pdf-lib'],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

export default nextConfig;
