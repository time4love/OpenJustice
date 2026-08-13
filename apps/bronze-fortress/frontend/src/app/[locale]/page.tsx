import Image from 'next/image';
import bronzeLogo from '../../../public/bronze_fortress.png';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HomeCta } from '@/components/HomeCta';

interface PublicPatternRow {
  figureId: string;
  figureName: string;
  figureType: string;
  courtName: string;
  courtCity: string;
  patternCategory: string;
  caseCount: number;
}

function Step({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm">
        {num}
      </div>
      <div>
        <p className="font-semibold text-slate-100 mb-1">{title}</p>
        <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

async function LivePatterns() {
  const t = await getTranslations('home');
  const ti = await getTranslations('intake');
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3002';

  let patterns: PublicPatternRow[] = [];
  try {
    const res = await fetch(`${backendUrl}/api/figures/patterns/public`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json() as { patterns?: PublicPatternRow[] };
      patterns = data.patterns ?? [];
    }
  } catch {
    return null;
  }

  if (patterns.length === 0) return null;

  // Group by figure, take top 3 for the homepage widget
  const byFigure = new Map<string, { name: string; court: string; rows: PublicPatternRow[] }>();
  for (const row of patterns) {
    if (!byFigure.has(row.figureId)) {
      byFigure.set(row.figureId, {
        name: row.figureName,
        court: `${row.courtName}, ${row.courtCity}`,
        rows: [],
      });
    }
    byFigure.get(row.figureId)!.rows.push(row);
  }

  const figures = [...byFigure.values()].slice(0, 3);

  return (
    <section className="mb-14">
      <h2 className="text-xl font-semibold text-slate-200 mb-2">{t('patternsTitle')}</h2>
      <p className="text-slate-400 text-sm mb-6">{t('patternsSubtitle')}</p>
      <div className="flex flex-col gap-4 mb-4">
        {figures.map((fig) => (
          <div key={fig.name} className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-5">
            <p className="font-semibold text-slate-200 mb-1">{fig.name}</p>
            <p className="text-xs text-slate-500 mb-3">{fig.court}</p>
            <div className="flex flex-col gap-2">
              {fig.rows.map((row) => {
                const labelKey = `patterns.${row.patternCategory}.label` as Parameters<typeof ti>[0];
                const label = ti.has(labelKey) ? ti(labelKey) : row.patternCategory;
                return (
                  <div key={row.patternCategory} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-300">{label}</span>
                    <span className="text-sm font-semibold text-amber-400 whitespace-nowrap">
                      {row.caseCount} {t('cases')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/patterns"
        className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
      >
        {t('viewAllPatterns')} →
      </Link>
    </section>
  );
}

export default function HomePage() {
  const t = useTranslations('home');
  const tc = useTranslations('common');

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">

      {/* Hero */}
      <div className="text-center mb-16">
        <div className="flex justify-center mb-5">
          <Image src={bronzeLogo} alt="מבצר הנחושת" width={120} height={120} priority />
        </div>
        <p className="text-sm text-amber-400/80 mb-8 leading-relaxed">{tc('tagline')}</p>
        <h1 className="text-5xl font-bold mb-5 leading-tight">{t('headline')}</h1>
        <p className="text-lg text-slate-300 leading-relaxed mb-8">{t('subheadline')}</p>
        <HomeCta />
      </div>

      {/* Live pattern counts — only shown when threshold is met */}
      <LivePatterns />

      {/* How it works */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-slate-200 mb-6">{t('howTitle')}</h2>
        <div className="flex flex-col gap-7">
          <Step num={1} title={t('step1Title')} body={t('step1Body')} />
          <Step num={2} title={t('step2Title')} body={t('step2Body')} />
          <Step num={3} title={t('step3Title')} body={t('step3Body')} />
        </div>
      </section>

      {/* Legal framing + privacy */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="font-semibold text-slate-200 mb-2">{t('privacyTitle')}</p>
          <p className="text-slate-400 text-sm leading-relaxed">{t('privacyBody')}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="font-semibold text-slate-200 mb-2">{t('legalTitle')}</p>
          <p className="text-slate-400 text-sm leading-relaxed">{t('legalBody')}</p>
        </div>
      </div>
    </div>
  );
}
