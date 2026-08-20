import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  images: {
    // Evidence screenshots (blocked-URL recovery, docs/gf-blocked-url-recovery-dev-plan.md
    // Phase 5) are hosted in Supabase Storage's public "evidence" bucket — wildcard
    // hostname since staging and production are separate Supabase projects.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/evidence/**',
      },
    ],
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // MCP OAuth login/consent bridge (docs/gf-mcp-oauth-dev-plan.md, Phase 3)
      // — same proxy pattern as /api above, for the same reason: when
      // NEXT_PUBLIC_API_URL isn't set (local dev, previews), apiUrl() returns
      // relative paths and needs something to proxy them to the real backend.
      // No collision with the frontend's own /[locale]/oauth/interaction/[uid]
      // page: next-intl's routing always prefixes locales (even the
      // default), so that page only ever lives at /he/... or /en/..., never
      // bare /oauth/... — which is exactly the unprefixed path our own
      // fetch()/form calls target.
      {
        source: '/oauth/:path*',
        destination: `${backendUrl}/oauth/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
