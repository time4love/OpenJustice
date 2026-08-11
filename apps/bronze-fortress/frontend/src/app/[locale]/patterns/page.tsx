import { getTranslations } from 'next-intl/server';

interface PublicPatternRow {
  figureId: string;
  figurePublicSequence: number;
  figureType: string;
  courtName: string;
  courtCity: string;
  patternCategory: string;
  caseCount: number;
}

interface FigureGroup {
  figureId: string;
  figurePublicSequence: number;
  figureType: string;
  courtName: string;
  courtCity: string;
  totalCases: number;
  patterns: PublicPatternRow[];
}

async function fetchPatterns(): Promise<PublicPatternRow[]> {
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3002';
  try {
    const res = await fetch(`${backendUrl}/api/figures/patterns/public`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json() as { patterns: PublicPatternRow[] };
    return data.patterns;
  } catch {
    return [];
  }
}

function groupByFigure(patterns: PublicPatternRow[]): FigureGroup[] {
  const map = new Map<string, FigureGroup>();
  for (const row of patterns) {
    if (!map.has(row.figureId)) {
      map.set(row.figureId, {
        figureId: row.figureId,
        figurePublicSequence: row.figurePublicSequence,
        figureType: row.figureType,
        courtName: row.courtName,
        courtCity: row.courtCity,
        totalCases: 0,
        patterns: [],
      });
    }
    const fig = map.get(row.figureId)!;
    fig.patterns.push(row);
    if (row.caseCount > fig.totalCases) fig.totalCases = row.caseCount;
  }
  // Sort by totalCases descending
  return [...map.values()].sort((a, b) => b.totalCases - a.totalCases);
}

export default async function PatternsPage() {
  const t = await getTranslations('patterns');
  const ti = await getTranslations('intake');

  const rawPatterns = await fetchPatterns();
  const figures = groupByFigure(rawPatterns);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-3">{t('title')}</h1>
      <p className="text-slate-400 text-sm leading-relaxed mb-8">{t('subtitle')}</p>

      {figures.length === 0 ? (
        <p className="text-slate-500 text-sm">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {figures.map((fig) => {
            const typeKey = `figureType.${fig.figureType}` as Parameters<typeof t>[0];
            const typeLabel = t.has(typeKey) ? t(typeKey) : fig.figureType;

            return (
              <div
                key={fig.figureId}
                className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
              >
                {/* Figure header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-semibold text-slate-100 text-lg">{typeLabel} {fig.figurePublicSequence}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fig.courtName}, {fig.courtCity}
                    </p>
                  </div>
                  <span className="flex-shrink-0 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                    {t('cases', { count: fig.totalCases })}
                  </span>
                </div>

                {/* Pattern list */}
                <div className="flex flex-col gap-2 border-t border-slate-700 pt-4">
                  {fig.patterns.map((row) => {
                    const labelKey = `patterns.${row.patternCategory}.label` as Parameters<typeof ti>[0];
                    const label = ti.has(labelKey) ? ti(labelKey) : row.patternCategory;
                    const descKey = `patterns.${row.patternCategory}.desc` as Parameters<typeof ti>[0];
                    const desc = ti.has(descKey) ? ti(descKey) : null;

                    return (
                      <div key={row.patternCategory} className="flex items-start gap-3">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-slate-200">{label}</p>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {row.caseCount} {t('cases', { count: row.caseCount }).split(' ').slice(1).join(' ')}
                            </span>
                          </div>
                          {desc && (
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legal + privacy note */}
      <div className="mt-10 grid sm:grid-cols-2 gap-4">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 leading-relaxed">{t('privacyNote')}</p>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 leading-relaxed">{t('legalNote')}</p>
        </div>
      </div>
    </div>
  );
}
