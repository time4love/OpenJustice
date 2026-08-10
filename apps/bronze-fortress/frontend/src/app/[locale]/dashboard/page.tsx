'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

interface CaseProfile {
  caseId: string;
  cooperationLevel: string;
  hasIntakeData: boolean;
  activeConsents: { tier: string; grantedAt: string }[];
}

const COOPERATION_KEYS: Record<string, string> = {
  NONE: 'cooperationNone',
  ANONYMOUS_TIMELINE: 'cooperationTimeline',
  ANONYMOUS_MESSAGING: 'cooperationMessaging',
  MUTUAL_INTRODUCTION: 'cooperationIntro',
  SHARED_EVIDENCE_ROOM: 'cooperationRoom',
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const [profile, setProfile] = useState<CaseProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/cases/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError('Failed to load case profile');
        return;
      }

      setProfile(await res.json() as CaseProfile);
    }

    load();
  }, []);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-slate-400">{tc('loading')}</p>
      </div>
    );
  }

  const shortId = profile.caseId.slice(-8);
  const cooperationKey = COOPERATION_KEYS[profile.cooperationLevel] ?? 'cooperationNone';

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>

      <div className="grid gap-4">
        {/* Case ID */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">{t('caseId')}</p>
          <p className="font-mono text-slate-200">···{shortId}</p>
        </div>

        {/* Status grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-1">{t('cooperationLevel')}</p>
            <p className="font-semibold text-slate-200">{t(cooperationKey as Parameters<typeof t>[0])}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-1">{t('hasIntake')}</p>
            <p className={`font-semibold ${profile.hasIntakeData ? 'text-emerald-400' : 'text-slate-400'}`}>
              {profile.hasIntakeData ? t('hasIntakeYes') : t('hasIntakeNo')}
            </p>
          </div>
        </div>

        {/* Consents */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-3">{t('consents')}</p>
          {profile.activeConsents.length === 0 ? (
            <p className="text-slate-500 text-sm">{t('noConsents')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.activeConsents.map((c) => (
                <span
                  key={c.tier}
                  className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-1 rounded-full"
                >
                  {COOPERATION_KEYS[c.tier] ? t(COOPERATION_KEYS[c.tier] as Parameters<typeof t>[0]) : c.tier}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <Link
          href="/intake"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl text-center transition-colors"
        >
          {t('addFacts')}
        </Link>
      </div>
    </div>
  );
}
