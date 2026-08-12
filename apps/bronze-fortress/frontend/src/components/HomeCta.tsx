'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/auth';

export function HomeCta() {
  const t = useTranslations('home');
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setLoggedIn(!!getSession());
  }, []);

  // Don't flash buttons before we know auth state
  if (loggedIn === null) return <div className="h-12" />;

  if (loggedIn) {
    return (
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/intake"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-7 py-3 rounded-lg transition-colors"
        >
          {t('addFactsCta')}
        </Link>
        <Link
          href="/dashboard"
          className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-7 py-3 rounded-lg transition-colors"
        >
          {t('dashboardCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <Link
        href="/register"
        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-7 py-3 rounded-lg transition-colors"
      >
        {t('registerCta')}
      </Link>
      <Link
        href="/login"
        className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-7 py-3 rounded-lg transition-colors"
      >
        {t('loginCta')}
      </Link>
    </div>
  );
}
