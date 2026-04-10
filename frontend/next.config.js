/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable build-time font inlining — Render's build env blocks fonts.gstatic.com
  optimizeFonts: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  },
}

module.exports = nextConfig
