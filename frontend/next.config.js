/** @type {import('next').NextConfig} */
const path = require('path')

// Node.js-only packages that must never be bundled for the browser
const SERVER_ONLY_PACKAGES = ['pg', 'pg-native', 'net', 'tls', 'fs', 'child_process', 'dns', 'http2']

// Security headers. CSP ships Report-Only first — a blocking policy risks
// breaking real flows (Supabase Auth/Storage, Google OAuth redirect, PostHog)
// before we've seen what it would have blocked in production traffic.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com https://eu-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  // Type errors fail the build. ESLint is not wired to `next build` (the repo's
  // .eslintrc has no @typescript-eslint plugin); run `npm run lint` separately.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: SERVER_ONLY_PACKAGES,
    instrumentationHook: true,
  },
  async redirects() {
    return [
      // Pre-merge URLs: the app used to live at app.crosthq.com/dashboard.
      { source: '/dashboard', destination: '/app', permanent: true },
      { source: '/dashboard/:path*', destination: '/app/:path*', permanent: true },
      { source: '/onboarding/:path*', destination: '/app/onboarding/:path*', permanent: true },
    ]
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
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
}

module.exports = nextConfig
