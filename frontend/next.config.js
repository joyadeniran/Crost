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

const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: SERVER_ONLY_PACKAGES,
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
  experimental: {
    serverActions: {
      allowedOrigins: ['app.crosthq.com'],
    },
  },
  env: {
    // Canonical Cloud Run URL — hardcoded to prevent build-time URL drift
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://crost-frontend-3ge3tx36sa-uc.a.run.app',
  },
}

module.exports = nextConfig
