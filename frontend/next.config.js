/** @type {import('next').NextConfig} */
const path = require('path')

// Node.js-only packages that must never be bundled for the browser
const SERVER_ONLY_PACKAGES = [
  'pg', 'pg-native',
  'firebase-admin',
  '@google-cloud/storage',
  '@google/adk',
  'google-auth-library',
  'net', 'tls', 'fs', 'child_process', 'dns', 'http2',
]

// Security headers (Phase 4, 10x rebuild). CSP ships Report-Only first —
// this app talks to Firebase Auth (popup/iframe), Vertex AI, GCS, and
// Composio, so a blocking policy risks breaking real flows without first
// seeing what it would have blocked in production traffic. Tighten to
// enforcing once report data confirms the allowlist is complete.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.google.com https://securetoken.google.com wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Next 14.2.x: this option lives under `experimental`, not top-level
  // (top-level `serverExternalPackages` is a Next 15 key and was silently
  // ignored here, producing the "Invalid next.config.js options" build
  // warning — cosmetic but noisy, fixed as part of Phase 4 config cleanup).
  experimental: {
    serverComponentsExternalPackages: SERVER_ONLY_PACKAGES,
    serverActions: {
      allowedOrigins: ['app.crosthq.com'],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }

    if (!isServer) {
      // On the client bundle, stub out all server-only modules
      SERVER_ONLY_PACKAGES.forEach(pkg => {
        config.resolve.alias[pkg] = false
      })
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false, tls: false, fs: false,
        child_process: false, dns: false, http2: false,
      }
    }

    return config
  },
  env: {
    // Canonical Cloud Run URL — hardcoded to prevent build-time URL drift
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://crost-frontend-3ge3tx36sa-uc.a.run.app',
  },
}

module.exports = nextConfig
