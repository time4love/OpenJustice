'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * Wrap write-access pages with this component.
 * Redirects unauthenticated users to /login.
 * Redirects authenticated users without a Researcher record to /login?step=handle.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { accessToken, researcher, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (!researcher) {
      router.push('/login?step=handle');
    }
  }, [loading, accessToken, researcher, router]);

  if (loading || !accessToken || !researcher) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
