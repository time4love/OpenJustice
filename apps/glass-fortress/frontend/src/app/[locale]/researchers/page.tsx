'use client';

import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';

// ---------------------------------------------------------------------------
// MCP tool list — descriptions stored here since they need locale handling
// ---------------------------------------------------------------------------

const TOOLS = [
  { name: 'suggest_thesis',               en: 'Propose a legal thesis from evidence',                                he: 'הצע תזה משפטית מהראיות' },
  { name: 'create_thesis_draft',          en: 'Save a structured thesis with evidence mentions',                     he: 'שמור תזה מובנית עם אזכורי ראיות' },
  { name: 'start_forensic_scan',          en: 'Scan government URLs for silent edits',                              he: 'סרוק כתובות URL ממשלתיות לאיתור עריכות שקטות' },
  { name: 'get_research_agenda',          en: 'See open evidence gaps per thesis',                                   he: 'ראה פערי ראיות פתוחים לכל תזה' },
  { name: 'generate_foia_request',        en: 'Generate a formatted FOIA letter for any evidence gap',              he: 'צור מכתב חופש מידע לכל פער' },
  { name: 'promote_evidence',             en: 'Register evidence on-chain and index in vector search',              he: 'רשום ראיה בשרשרת הבלוקים ואנדקס בחיפוש' },
  { name: 'enrich_evidence_with_history', en: "Link a URL's full version history to a piece of evidence",           he: 'קשר היסטוריית גרסאות של URL לראיה' },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResearchersPage() {
  const t = useTranslations('researchers');
  const locale = useLocale();

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <SiteHeader current="researchers" />

      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
          <span className="inline-block text-xs font-mono tracking-widest text-slate-400 uppercase mb-4 border border-slate-700 px-3 py-1 rounded-full">
            {t('badge')}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">{t('title')}</h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-xl">{t('subtitle')}</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        {/* How It Works */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">
            {t('howItWorksTitle')}
          </h2>
          <div className="space-y-8">
            {(
              [
                { title: t('step1Title'), body: t('step1Body') },
                { title: t('step2Title'), body: t('step2Body') },
                { title: t('step3Title'), body: t('step3Body') },
              ] as const
            ).map((step, i) => (
              <div key={i} className="flex gap-5">
                <div className="flex-none w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MCP Tools */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-6">
            {t('toolsTitle')}
          </h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-start gap-4 px-5 py-4">
                <code className="shrink-0 text-xs font-mono bg-slate-800 text-emerald-400 px-2.5 py-1 rounded mt-0.5">
                  {tool.name}
                </code>
                <span className="text-sm text-slate-600">
                  {locale === 'he' ? tool.he : tool.en}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Public note */}
        <aside className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <span className="shrink-0 mt-0.5">i</span>
          <p>{t('publicNote')}</p>
        </aside>

        {/* Request Access CTA */}
        <section className="border-t border-slate-200 pt-12 text-center space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">{t('contactTitle')}</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">{t('contactBody')}</p>
          <a
            href="mailto:tederyesharel@gmail.com"
            className="inline-block px-6 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            {t('contactBtn')}
          </a>
        </section>
      </div>
    </main>
  );
}
