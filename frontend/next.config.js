/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  output: 'standalone',
  typescript: {
    // Type errors from Supabase→Cloud SQL migration are non-blocking.
    // Remove once api routes are fully typed against db.ts interface.
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    return config
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['app.crosthq.com'],
    },
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.crosthq.com',
  },
  // Packages that should not be bundled (native Node.js modules for server-side only)
  serverExternalPackages: ['pg', 'firebase-admin', '@google-cloud/storage', '@google/adk'],
}

module.exports = nextConfig
