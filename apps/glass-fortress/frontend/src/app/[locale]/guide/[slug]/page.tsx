'use client';

import Image from 'next/image';
import { useParams, notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { MCP_SERVER_URL } from '@/lib/api';
import { GuideStatusBadge } from '@/components/GuideStatusBadge';
import { CopyableCode } from '@/components/CopyableCode';
import {
  GUIDE_ARC_ACCENT,
  findGuidePhase,
  guideScreenshots,
  guideNeighbours,
  guideStatus,
  type GuidePhase,
} from '@/lib/guide';

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function Callout({
  label,
  body,
  tone,
}: {
  label: string;
  body: string;
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-white border-slate-200',
    warning: 'bg-amber-50/60 border-amber-200',
    danger: 'bg-rose-50/60 border-rose-200',
  } as const;
  const labelTones = {
    neutral: 'text-slate-500',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
  } as const;

  return (
    <section className={`border rounded-xl p-5 shadow-sm ${tones[tone]}`}>
      <h2 className={`text-xs font-semibold uppercase tracking-widest mb-2.5 ${labelTones[tone]}`}>
        {label}
      </h2>
      <p className="text-sm text-slate-700 leading-relaxed">{body}</p>
    </section>
  );
}

function StepList({ phase }: { phase: GuidePhase }) {
  const t = useTranslations('guide');
  const accent = GUIDE_ARC_ACCENT[phase.arc];
  const detailSteps = new Set<string>(phase.detailSteps);

  return (
    <ol className="space-y-5">
      {phase.steps.map((stepId, index) => (
        <li key={stepId} className="flex gap-4">
          <span
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold"
            style={{ backgroundColor: accent + '18', color: accent }}
          >
            {index + 1}
          </span>
          <div className="pt-0.5 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
              {t(`phases.${phase.slug}.steps.${stepId}.title`)}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t(`phases.${phase.slug}.steps.${stepId}.body`)}
            </p>
            {/* Implementation depth, folded away. A page that states every
                mechanism inline reads as a spec, and the flow it exists to
                teach disappears into it. Native <details>: no JS, keyboard
                accessible, and it prints expanded. */}
            {detailSteps.has(stepId) && (
              <details className="mt-3 group">
                <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors list-none flex items-center gap-1.5">
                  {/* Direction-agnostic on purpose. A rotating chevron has to
                      be mirrored in RTL and re-mirrored when open, and the
                      rotation silently resolved to 0deg here — so the marker
                      would have pointed the same way in both states. +/- cannot
                      point the wrong way. */}
                  <span
                    aria-hidden
                    className="inline-block w-3 text-center font-mono leading-none"
                  >
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  {t('detailLabel')}
                </summary>
                <div className="mt-2 ps-4 border-s-2 border-slate-200 space-y-2.5">
                  {t(`phases.${phase.slug}.steps.${stepId}.detail`)
                    .split('\n\n')
                    .map((para, i) => (
                      <p key={i} className="text-xs text-slate-500 leading-relaxed">
                        {para}
                      </p>
                    ))}
                </div>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuidePhasePage() {
  const params = useParams<{ slug: string }>();
  const t = useTranslations('guide');
  const phase = findGuidePhase(params.slug);

  if (!phase) notFound();

  const accent = GUIDE_ARC_ACCENT[phase.arc];
  const status = guideStatus(phase);
  const { previous, next } = guideNeighbours(phase.slug);
  const screenshots = guideScreenshots(phase);

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader current="guide" />

      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-6"
          >
            <span aria-hidden className="rtl:hidden">&larr;</span>
            <span aria-hidden className="hidden rtl:inline">&rarr;</span>
            {t('backToIndex')}
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span
              className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: accent + '30', color: '#fff' }}
            >
              {phase.phase === null ? t('prerequisiteLabel') : t('phaseLabel', { n: phase.phase })}
            </span>
            <GuideStatusBadge status={status} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-4">
            {t(`phases.${phase.slug}.title`)}
          </h1>
          <p className="text-slate-300 text-base leading-relaxed">
            {t(`phases.${phase.slug}.summary`)}
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        {/* What it produces */}
        <Callout label={t('goalLabel')} body={t(`phases.${phase.slug}.goal`)} tone="neutral" />

        {/* Both callouts sit ABOVE the steps: a warning after the instructions
            is a warning that arrives after the mistake. */}
        {phase.environmentCritical && (
          <Callout label={t('envWarningTitle')} body={t('envWarningBody')} tone="warning" />
        )}
        {phase.irreversible && (
          <Callout label={t('irreversibleLabel')} body={t('irreversibleBody')} tone="danger" />
        )}

        {/* Tools — omitted entirely on the prerequisite pages, which drive none.
            An empty "MCP tools" heading reads as a missing list, not as none. */}
        {phase.tools.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            {t('toolsLabel')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {phase.tools.map((tool) => (
              <li
                key={tool}
                className="font-mono text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded"
              >
                {tool}
              </li>
            ))}
          </ul>
        </section>
        )}

        {/* The endpoint, on the one page that tells you to paste it. An
            instruction to enter an address that does not give the address is
            not an instruction. */}
        {phase.slug === 'connect' && (
          <section className="bg-slate-900 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">
              {t('endpointLabel')}
            </h2>
            <CopyableCode value={MCP_SERVER_URL} />
            <p className="text-xs text-slate-400 leading-relaxed mt-3">{t('endpointNote')}</p>
          </section>
        )}

        {/* Steps */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <StepList phase={phase} />
        </section>

        {/* What the interface looks like. Rule C allows an image of a client's
            settings dialog and bars one of a conversation — the line is what is
            in the frame, not whether it is a picture. */}
        {screenshots.length > 0 ? (
          <section className="space-y-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {t('screenshotsLabel')}
            </h2>
            {screenshots.map((shot) => (
              <figure key={shot.id} className="space-y-2">
                <Image
                  src={`/guide/${shot.id}.png`}
                  alt={t(`phases.${phase.slug}.screenshots.${shot.id}`)}
                  width={shot.width}
                  height={shot.height}
                  className="w-full h-auto rounded-xl border border-slate-200 shadow-sm"
                />
                <figcaption className="text-xs text-slate-500 leading-relaxed">
                  {t(`phases.${phase.slug}.screenshots.${shot.id}`)}
                </figcaption>
              </figure>
            ))}
          </section>
        ) : (
          <section className="border border-dashed border-slate-300 rounded-xl p-5 bg-white/50">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5">
              {t('screenshotsLabel')}
            </h2>
            <p className="text-sm font-medium text-slate-700 mb-1.5">
              {t('screenshotsPendingTitle')}
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">{t('screenshotsPendingBody')}</p>
          </section>
        )}

        {/* The flow is a loop, not a line: classification produces candidates
            that re-enter the evidence phase. Saying so beats implying the
            phases run once each, in order, and stop. */}
        {phase.slug === 'classification' && (
          <p className="text-sm text-slate-500 leading-relaxed border-s-2 border-slate-300 ps-4">
            {t('loopNote')}
          </p>
        )}

        {/* Verification, then the failure it exists because of */}
        <Callout label={t('verifyLabel')} body={t(`phases.${phase.slug}.verify`)} tone="neutral" />
        <Callout label={t('pitfallLabel')} body={t(`phases.${phase.slug}.pitfall`)} tone="warning" />

        {/* Worked example from the production run */}
        <section className="border border-dashed border-slate-300 rounded-xl p-5 bg-white/50">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5">
            {t('exampleLabel')}
          </h2>
          {phase.hasProductionExample ? (
            <p className="text-sm text-slate-700 leading-relaxed">
              {t(`phases.${phase.slug}.example`)}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700 mb-1.5">
                {t('examplePendingTitle')}
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">{t('examplePendingBody')}</p>
            </>
          )}
        </section>

        {/* Neighbours */}
        <nav className="flex flex-wrap gap-3 pt-2">
          {previous && (
            <Link
              href={`/guide/${previous.slug}`}
              className="flex-1 min-w-[45%] bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <span className="block text-[11px] text-slate-400 mb-1">{t('prevLabel')}</span>
              <span className="block text-sm font-medium text-slate-800">
                {t(`phases.${previous.slug}.title`)}
              </span>
            </Link>
          )}
          {next && (
            <Link
              href={`/guide/${next.slug}`}
              className="flex-1 min-w-[45%] bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <span className="block text-[11px] text-slate-400 mb-1">{t('nextLabel')}</span>
              <span className="block text-sm font-medium text-slate-800">
                {t(`phases.${next.slug}.title`)}
              </span>
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
