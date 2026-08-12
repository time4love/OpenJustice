'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { getSession } from '@/lib/auth';

interface Court {
  id: string;
  name: string;
  city: string;
  district: string;
}

interface IntakeCounts {
  complaints: number;
  nzakut: number;
  welfare: number;
  evaluator: number;
  guardian: number;
}

interface CaseProfile {
  cooperationLevel: string;
  court: Court | null;
  hasIntakeData: boolean;
  intakeCounts: IntakeCounts;
  activeConsents: { tier: string; grantedAt: string }[];
}

interface CommittedPattern {
  patternCategory: string;
  onChainTxHash: string | null;
  otherCasesCount: number;
}

interface CommittedFigure {
  figureId: string;
  figureName: string;
  figureType: string;
  courtName: string;
  patterns: CommittedPattern[];
}

type PageState = 'loading' | 'no-vault' | 'setting-up' | 'ready' | 'error';

function generatePublicKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [profile, setProfile] = useState<CaseProfile | null>(null);
  const [figures, setFigures] = useState<CommittedFigure[]>([]);

  const [availableCourts, setAvailableCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [courtSaving, setCourtSaving] = useState(false);
  const [courtSaved, setCourtSaved] = useState(false);

  const loadDashboard = useCallback(async () => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }

    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [profileRes, allegationsRes] = await Promise.all([
      fetch('/api/cases/me', { headers }),
      fetch('/api/cases/me/allegations', { headers }),
    ]);

    if (profileRes.status === 403) {
      setState('no-vault');
      return;
    }
    if (!profileRes.ok) {
      setState('error');
      return;
    }

    const p = await profileRes.json() as CaseProfile;
    setProfile(p);

    if (!p.court) {
      fetch('/api/figures/courts')
        .then((r) => r.json() as Promise<{ courts?: Court[] }>)
        .then((data) => setAvailableCourts(data.courts ?? []))
        .catch(() => {});
    }

    if (allegationsRes.ok) {
      const { figures: f } = await allegationsRes.json() as { figures: CommittedFigure[] };
      setFigures(f);
    }
    setState('ready');
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function setupVault() {
    setState('setting-up');
    const session = getSession();
    if (!session) { setState('error'); return; }

    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ publicKeyHex: generatePublicKeyHex() }),
    });

    if (res.ok || res.status === 409) {
      await loadDashboard();
    } else {
      setState('error');
    }
  }

  async function saveCourt(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourtId) return;
    setCourtSaving(true);
    const session = getSession();
    if (!session) { setCourtSaving(false); return; }

    const res = await fetch('/api/cases/me/court', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ courtId: selectedCourtId }),
    });

    if (res.ok) {
      const { court } = await res.json() as { court: Court };
      setProfile((prev) => prev ? { ...prev, court } : prev);
      setCourtSaved(true);
      setTimeout(() => setCourtSaved(false), 2000);
    }
    setCourtSaving(false);
  }

  if (state === 'loading' || state === 'setting-up') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-slate-400">{state === 'setting-up' ? t('settingUp') : tc('loading')}</p>
      </div>
    );
  }

  if (state === 'no-vault') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-slate-400 mb-6">{t('noVault')}</p>
        <button
          onClick={setupVault}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {t('noVaultAction')}
        </button>
      </div>
    );
  }

  if (state === 'error' || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-red-400">{tc('error')}</p>
      </div>
    );
  }

  const { intakeCounts } = profile;
  const DOMAINS = [
    { key: 'complaints', count: intakeCounts.complaints },
    { key: 'nzakut', count: intakeCounts.nzakut },
    { key: 'welfare', count: intakeCounts.welfare },
    { key: 'evaluator', count: intakeCounts.evaluator },
    { key: 'guardian', count: intakeCounts.guardian },
  ] as const;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href="/intake"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {t('addFacts')}
        </Link>
      </div>

      <div className="grid gap-5">
        {/* Court */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">{t('court')}</p>
          {profile.court ? (
            <p className="text-slate-200 font-medium">
              {profile.court.name}
              <span className="text-slate-500 text-sm font-normal ms-2">{profile.court.city}</span>
            </p>
          ) : (
            <form onSubmit={saveCourt} className="flex gap-3 items-center">
              <select
                value={selectedCourtId}
                onChange={(e) => setSelectedCourtId(e.target.value)}
                required
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm [color-scheme:dark] focus:outline-none focus:border-amber-500"
              >
                <option value="">{t('noCourt')}</option>
                {availableCourts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={courtSaving || !selectedCourtId}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap"
              >
                {courtSaved ? t('courtSaved') : courtSaving ? '...' : t('setCourt')}
              </button>
            </form>
          )}
        </div>

        {/* Intake summary */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-4">{t('factsTitle')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DOMAINS.map((d) => (
              <div
                key={d.key}
                className={`rounded-lg px-3 py-2.5 border ${
                  d.count > 0
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <p className={`text-xl font-bold ${d.count > 0 ? 'text-amber-300' : 'text-slate-600'}`}>
                  {d.count}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  {t(`domains.${d.key}` as Parameters<typeof t>[0])}
                </p>
              </div>
            ))}
          </div>
          {!profile.hasIntakeData && (
            <p className="text-sm text-slate-500 mt-4">{t('noFacts')}</p>
          )}
        </div>

        {/* Committed patterns */}
        {figures.length > 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-4">{t('patternsTitle')}</p>
            <div className="flex flex-col gap-5">
              {figures.map((fig) => (
                <div key={fig.figureId}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-semibold text-slate-200 text-sm">{fig.figureName}</span>
                    <span className="text-xs text-slate-500">{fig.courtName}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 ps-3 border-s border-slate-700">
                    {fig.patterns.map((p) => {
                      const labelKey = `patternLabel.${p.patternCategory}` as Parameters<typeof t>[0];
                      const label = t.has(labelKey) ? t(labelKey) : p.patternCategory;
                      return (
                        <div key={p.patternCategory} className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              p.onChainTxHash ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                            }`}
                          />
                          <span className="text-sm text-slate-300">{label}</span>
                          {p.onChainTxHash && (
                            <span className="text-xs text-emerald-500">✓ on-chain</span>
                          )}
                          {p.otherCasesCount > 0 && (
                            <span className="text-xs text-amber-400 ms-auto">
                              {t('notAlone', { count: p.otherCasesCount })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : profile.hasIntakeData ? (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
            <p className="text-sm text-slate-500">{t('noPatterns')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
