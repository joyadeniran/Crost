// lib/marketing-config.ts
// Single source of truth for marketing-site CTAs. The app now lives on the same
// origin (/app), so the beta CTA is a same-site link — no cross-domain login.

export const MARKETING = {
  ctaLabel: 'Try the beta',
  ctaHref: '/signup?source=landing',
  loginHref: '/login',
  appHref: '/app',
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://crosthq.com',
} as const
