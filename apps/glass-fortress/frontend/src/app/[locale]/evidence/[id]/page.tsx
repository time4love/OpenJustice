'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { CategoryBadges } from '@/components/CategoryBadges';
import { TierBadge } from '@/components/TierBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceDetail {
  evidenceId: string;
  fileHash: string;
  status: string;
  evidenceType: string;
  evidenceRole: string;
  investigativeCategories: string[];
  evidenceTier: string;
  evidencePerspective?: string | null;
  tierReasoning?: string | null;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  figures: { id: string; name: string }[];
  medicalConditions: string[];
  statisticalClaims: string[];
  regulatoryMentions: string[];
  euaOmissionStatus: string;
  sourceUrl?: string | null;
  fileUrl?: string | null;
  trackedUrlId?: string | null;
  citingTheses: { id: string; title: string | null }[];
  createdAt: string;
  createdBy?: { handle: string } | null;
}

// ---------------------------------------------------------------------------
// Section block
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EvidencePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const t = useTranslations('evidence');

  const [evidence, setEvidence] = useState<EvidenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/evidence/${id}`));
        if (res.status === 404) { setError('notFound'); setLoading(false); return; }
        if (!res.ok) { setError('error'); setLoading(false); return; }
        const data = (await res.json()) as EvidenceDetail;
        setEvidence(data);
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <TopNav current="vault" />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {/* Back */}
        <Link href="/vault" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
          {t('backLink')}
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-red-500 animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-24 text-slate-500 text-sm">
            {error === 'notFound' ? t('notFound') : t('errorTitle')}
          </div>
        )}

        {evidence && (
          <>
            {/* Header */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-start gap-2">
                <TierBadge tier={evidence.evidenceTier} />
                {evidence.evidenceType === 'FORENSIC_DIFF' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">
                    <Image src="/icon_diff.png" alt="" width={14} height={14} className="w-3.5 h-3.5" />
                    {t('forensicDiff')}
                  </span>
                )}
                {evidence.status === 'PENDING_REVIEW' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-200">
                    {t('pendingReview')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">
                    ✓ {t('onChain')}
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  evidence.evidenceRole === 'Incriminating'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {evidence.evidenceRole === 'Incriminating' ? t('roleIncriminating') : t('roleContextAnchor')}
                </span>
              </div>

              <p className="text-slate-800 text-sm leading-relaxed">{evidence.summary}</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{t('date')}</p>
                  <p className="text-sm font-medium text-slate-700">{evidence.evidenceDate}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{t('target')}</p>
                  <p className="text-sm font-medium text-slate-700">{evidence.targetEntity}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{t('category')}</p>
                  <CategoryBadges categories={evidence.investigativeCategories} />
                </div>
                {evidence.evidencePerspective && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">{t('perspective')}</p>
                    <p className="text-sm font-medium text-slate-700">{evidence.evidencePerspective}</p>
                  </div>
                )}
                {evidence.createdBy?.handle && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">{t('submittedBy')}</p>
                    <p className="text-sm font-mono text-slate-600">{evidence.createdBy.handle}</p>
                  </div>
                )}
              </div>

              {evidence.tierReasoning && (
                <div className="pt-1 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">{t('tierReasoning')}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{evidence.tierReasoning}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {(evidence.sourceUrl ?? evidence.fileUrl) && (
                <a
                  href={evidence.sourceUrl ?? evidence.fileUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                >
                  {t('viewSource')} ↗
                </a>
              )}
              {evidence.trackedUrlId && (
                <Link
                  href={`/forensics/${evidence.trackedUrlId}`}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {t('viewDiffHistory')}
                </Link>
              )}
            </div>

            {/* File hash */}
            <Section label={t('fileHash')}>
              <p className="text-xs font-mono text-slate-600 break-all">{evidence.fileHash}</p>
              {evidence.status === 'PENDING_REVIEW' && (
                <p className="text-xs text-amber-600 mt-1">{t('pendingReviewNote')}</p>
              )}
            </Section>

            {/* Key figures */}
            {evidence.figures.length > 0 && (
              <Section label={t('keyFigures')}>
                <div className="flex flex-wrap gap-2">
                  {evidence.figures.map((f) => (
                    <Link
                      key={f.id}
                      href={`/figures?id=${f.id}`}
                      className="px-3 py-1 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium transition-colors"
                    >
                      @{f.name}
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            {/* EUA status */}
            {evidence.euaOmissionStatus && (
              <Section label="EUA">
                <span className={`text-xs font-semibold ${
                  evidence.euaOmissionStatus === 'Omitted' ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {evidence.euaOmissionStatus === 'Omitted' ? t('euaOmitted') : t('euaMentioned')}
                </span>
              </Section>
            )}

            {/* Medical / Statistical / Regulatory */}
            {evidence.medicalConditions.length > 0 && (
              <Section label={t('medicalContext')}>
                <ul className="space-y-1">
                  {evidence.medicalConditions.map((c, i) => (
                    <li key={i} className="text-xs text-slate-700">• {c}</li>
                  ))}
                </ul>
              </Section>
            )}
            {evidence.statisticalClaims.length > 0 && (
              <Section label={t('statisticalClaims')}>
                <ul className="space-y-1">
                  {evidence.statisticalClaims.map((c, i) => (
                    <li key={i} className="text-xs text-slate-700">• {c}</li>
                  ))}
                </ul>
              </Section>
            )}
            {evidence.regulatoryMentions.length > 0 && (
              <Section label={t('regulatoryMentions')}>
                <ul className="space-y-1">
                  {evidence.regulatoryMentions.map((c, i) => (
                    <li key={i} className="text-xs text-slate-700">• {c}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Citing theses */}
            <Section label={t('citingTheses')}>
              {evidence.citingTheses.length === 0 ? (
                <p className="text-xs text-slate-400 italic">{t('noCitingTheses')}</p>
              ) : (
                <ul className="space-y-2">
                  {evidence.citingTheses.map((thesis) => (
                    <li key={thesis.id}>
                      <Link
                        href={`/theses/${thesis.id}`}
                        className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
                      >
                        {thesis.title ?? thesis.id}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}
