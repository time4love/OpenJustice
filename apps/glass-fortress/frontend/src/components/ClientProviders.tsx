'use client';

import '@/lib/stagingApiAuth';
import { AuthProvider } from '@/context/AuthContext';

/** Client-side providers wrapping the locale layout. */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
