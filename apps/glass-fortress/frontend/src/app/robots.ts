import type { MetadataRoute } from 'next';
import { isProduction } from '@/lib/appEnv';

// Read `APP_ENV` at request time, not build time — the same image must be able
// to serve either environment.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Belt and braces with the access gate in `proxy.ts`: a crawler should never
  // get past the password, but a misconfigured matcher must not be able to put
  // unreviewed allegations into a search index.
  if (!isProduction()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return { rules: { userAgent: '*', allow: '/' } };
}
