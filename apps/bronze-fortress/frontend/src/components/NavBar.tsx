'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export function NavBar() {
  const t = useTranslations('common');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <nav className="border-b border-slate-800 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-amber-400">
          {t('appName')}
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="text-slate-300 hover:text-white transition-colors">
                {t('dashboard')}
              </Link>
              <Link href="/intake" className="text-slate-300 hover:text-white transition-colors">
                {t('intake')}
              </Link>
              <button
                onClick={handleSignOut}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {t('signOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
                כניסה
              </Link>
              <Link
                href="/register"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-1.5 rounded-lg transition-colors"
              >
                הרשמה
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
