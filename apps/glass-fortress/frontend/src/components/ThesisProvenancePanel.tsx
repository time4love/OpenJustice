'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchThesisProvenance } from '@/lib/thesisApi';
import { useAsyncData } from '@/hooks/useAsyncData';
import type {
  ParsedAssessment,
  ProvenanceEvent,
  ProvenanceSession,
  ThesisProvenance,
} from '@/types/thesis';

// ---------------------------------------------------------------------------
// How this thesis came to say what it says.
//
// docs/gf-thesis-provenance-ui-dev-plan.md. Every consequential act was already
// recorded as a ResearchSessionEvent and none of it was reachable from the UI —
// the record existed and only a researcher driving MCP tools could read it.
//
// Researcher-only. This is a concentrated feed of rejected framings, recorded
// dissent, and an adversary's objections about named living officials, which
// docs/defamation-risk.md ranks as the top risk surface. It is also the most
// interesting view on the site, which is exactly why someone will eventually
// argue for making it public.
//
// Three rules the rendering has to keep:
//
//   Nothing here parses prose. The backend returns assessments already parsed
//   and validated; this renders fields.
//
//   "No provenance recorded", "you may not see this" and "it failed to load"
//   are three different facts and never look alike.
//
//   Dissent is shown, not buried. A DISPUTES verdict published over is the most
//   important thing in this record, and the "published" badge hides it.
// ---------------------------------------------------------------------------

type Load =
  | { state: 'loading' }
  | { state: 'ok'; provenance: ThesisProvenance }
  | { state: 'forbidden' }
  | { state: 'error'; message: string };

/** Event types with their own presentation. Everything else renders as a plain line. */
const TONE: Partial<Record<ProvenanceEvent['type'], string>> = {
  FRAMING_PROPOSED: 'border-violet-300 bg-violet-50',
  FRAMING_ASSESSED: 'border-indigo-300 bg-indigo-50',
  THESIS_ATTACHED: 'border-emerald-300 bg-emerald-50',
  PUBLICATION_RATIONALE: 'border-sky-300 bg-sky-50',
  PUBLICATION_ASSESSED: 'border-sky-300 bg-sky-50',
  THESIS_PUBLISHED: 'border-emerald-400 bg-emerald-50',
  THESIS_UNPUBLISHED: 'border-orange-300 bg-orange-50',
  SESSION_CLOSED_BY_OTHER: 'border-orange-300 bg-orange-50',
};

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(locale === 'he' ? 'he-IL' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

/**
 * A stored assessment that could not be read.
 *
 * Rendered LOUDLY and never as an empty section: an unreadable record and an
 * assessment that found nothing are opposite facts, and the whole point of this
 * page is that its record cannot be quietly curated.
 */
function MalformedNotice({ reason, raw }: { reason: string; raw: string }) {
  const t = useTranslations('theses');
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-1.5">
      <div className="text-xs font-semibold text-red-800">{t('provenance.malformedHeading')}</div>
      <p className="text-xs text-red-700 leading-relaxed">{t('provenance.malformedExplain')}</p>
      <p className="text-[11px] text-red-600 font-mono break-words" dir="ltr">{reason}</p>
      <pre className="text-[11px] text-red-500 bg-white/60 rounded p-2 whitespace-pre-wrap break-words" dir="ltr">
        {raw}
      </pre>
    </div>
  );
}

function FramingAssessmentBody({ parsed }: { parsed: ParsedAssessment<import('@/types/thesis').FramingAssessment> }) {
  const t = useTranslations('theses');
  if (parsed.state === 'malformed') return <MalformedNotice reason={parsed.reason} raw={parsed.raw} />;
  if (parsed.state === 'absent') return <p className="text-xs text-slate-500">{t('provenance.assessmentAbsent')}</p>;

  const a = parsed.value;
  return (
    <div className="space-y-3">
      {/* Contradictions first, deliberately. Being told your own evidence points
          the other way is the valuable half; candidate framings are the easy one. */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-indigo-900">
          {t('provenance.contradictionsHeading', { count: a.contradictions.length })}
        </div>
        {a.contradictions.length === 0 ? (
          <p className="text-xs text-slate-600">{t('provenance.noContradictions')}</p>
        ) : (
          <ul className="space-y-2">
            {a.contradictions.map((c, i) => (
              <li key={`${c.fileHash}-${String(i)}`} className="text-xs leading-relaxed bg-white/70 rounded p-2 space-y-1">
                <div className="text-slate-800">
                  <span className="font-semibold">{t('provenance.researcherClaimed')}: </span>
                  {c.researcherClaim}
                </div>
                <div className="text-slate-800">
                  <span className="font-semibold">{t('provenance.evidenceShows')}: </span>
                  {c.whatEvidenceShows}
                </div>
                <div className="font-mono text-[11px] text-slate-500" dir="ltr">{c.fileHash}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {a.unverifiedAssumptions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-indigo-900">{t('provenance.assumptionsHeading')}</div>
          <ul className="space-y-1.5">
            {a.unverifiedAssumptions.map((u, i) => (
              <li key={String(i)} className="text-xs leading-relaxed text-slate-700">
                {u.assumption}
                <span className="text-slate-500"> — {u.howToVerify}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.candidateFramings.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-indigo-900">
            {t('provenance.candidatesHeading', { count: a.candidateFramings.length })}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {a.candidateFramings.map((c, i) => (
              <li key={String(i)} className="leading-relaxed text-slate-700">
                <span className="text-slate-400">[{c.scope}]</span> {c.framing}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs leading-relaxed text-slate-700 border-t border-indigo-200 pt-2">{a.assessment}</p>
      <p className="text-xs text-slate-600">
        <span className="font-semibold">{t('provenance.recommendedHeading')}: </span>
        {a.recommendedTopicString}
      </p>
    </div>
  );
}

function PublicationAssessmentBody({
  parsed,
}: {
  parsed: ParsedAssessment<import('@/types/thesis').PublicationAssessment>;
}) {
  const t = useTranslations('theses');
  if (parsed.state === 'malformed') return <MalformedNotice reason={parsed.reason} raw={parsed.raw} />;
  if (parsed.state === 'absent') return <p className="text-xs text-slate-500">{t('provenance.assessmentAbsent')}</p>;

  const a = parsed.value;
  return (
    <div className="space-y-2">
      <div className="text-xs">
        <span className={a.verdict === 'DISPUTES' ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}>
          {a.verdict === 'DISPUTES' ? t('provenance.verdictDisputes') : t('provenance.verdictSupports')}
        </span>
        <span className="text-slate-400"> · {t('provenance.verdictAdvisory')}</span>
      </div>

      {a.verdict === 'DISPUTES' && a.objection.length > 0 && (
        <p className="text-xs leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded p-2">
          {a.objection}
        </p>
      )}

      {!a.rationaleHasSubstance && a.substanceGaps.length > 0 && (
        <ul className="text-xs text-amber-800 space-y-1">
          {a.substanceGaps.map((g, i) => (
            <li key={String(i)}>△ {g}</li>
          ))}
        </ul>
      )}

      {!a.officialCapacityOk && a.characterClaims.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-800">{t('provenance.characterClaimsHeading')}</div>
          <ul className="text-xs text-amber-800 space-y-1">
            {a.characterClaims.map((c, i) => (
              <li key={String(i)} className="leading-relaxed">“{c}”</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-700">{a.assessment}</p>
    </div>
  );
}

function EventRow({ event, locale }: { event: ProvenanceEvent; locale: string }) {
  const t = useTranslations('theses');
  const tone = TONE[event.type] ?? 'border-slate-200 bg-white';

  return (
    <li className={`rounded-lg border ${tone} p-3 space-y-2`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-800">{t(`provenance.events.${event.type}`)}</span>
        <span className="text-[11px] text-slate-500" dir="ltr">{formatWhen(event.createdAt, locale)}</span>
      </div>

      {event.description !== null && event.description.length > 0 && (
        <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap" dir="auto">
          {event.description}
        </p>
      )}

      {event.framingAssessment && <FramingAssessmentBody parsed={event.framingAssessment} />}
      {event.publicationAssessment && <PublicationAssessmentBody parsed={event.publicationAssessment} />}
    </li>
  );
}

function SessionBlock({ session, locale }: { session: ProvenanceSession; locale: string }) {
  const t = useTranslations('theses');
  return (
    <section className="space-y-2">
      <header className="space-y-0.5">
        <h4 className="text-sm font-semibold text-slate-900" dir="auto">
          {session.question ?? session.name}
        </h4>
        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
          {/* A session with no owner predates ownership. It renders as UNKNOWN
              rather than blank: a blank reads as "nobody", and someone did open it. */}
          <span>{session.researcherHandle ?? t('provenance.unknownActor')}</span>
          <span>·</span>
          <span dir="ltr">{formatWhen(session.createdAt, locale)}</span>
          <span>·</span>
          <span>{session.status}</span>
        </div>
      </header>
      <ol className="space-y-2">
        {session.events.map((e) => (
          <EventRow key={e.id} event={e} locale={locale} />
        ))}
      </ol>
    </section>
  );
}

export function ThesisProvenancePanel({ thesisId, locale }: { thesisId: string; locale: string }) {
  const t = useTranslations('theses');

  // `fetchThesisProvenance` answers with forbidden/error rather than throwing —
  // "you may not see this" is an outcome, not a failure — so an `ok` result here
  // still carries three possible answers, and the reject branch only fires if
  // the call itself blows up.
  const fetchProvenance = useCallback(
    (signal: AbortSignal) => fetchThesisProvenance(thesisId, signal),
    [thesisId],
  );
  const { state, reload } = useAsyncData(fetchProvenance);
  const [retrying, setRetrying] = useState(false);

  const load: Load = retrying
    ? { state: 'loading' }
    : state.status === 'ok'
      ? state.data
      : state.status === 'error'
        ? { state: 'error', message: state.error.message }
        : { state: 'loading' };

  function retry(): void {
    setRetrying(true);
    void reload().finally(() => { setRetrying(false); });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-900">{t('provenance.title')}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">{t('provenance.intro')}</p>
      </div>

      {load.state === 'loading' && <p className="text-xs text-slate-500">{t('provenance.loading')}</p>}

      {/* Three distinct answers, never one. "You may not see this" is not
          "nothing was recorded", and neither is "it failed to load". */}
      {load.state === 'forbidden' && <p className="text-xs text-slate-600">{t('provenance.forbidden')}</p>}

      {load.state === 'error' && (
        <div className="text-xs text-red-700 space-y-1">
          <p>{t('provenance.loadFailed')}</p>
          <p className="font-mono text-[11px] text-red-600" dir="ltr">{load.message}</p>
          <button onClick={retry} className="underline hover:no-underline">
            {t('provenance.retry')}
          </button>
        </div>
      )}

      {load.state === 'ok' && load.provenance.empty && (
        <p className="text-xs text-slate-600 leading-relaxed">{t('provenance.emptyState')}</p>
      )}

      {load.state === 'ok' && !load.provenance.empty && (
        <div className="space-y-4">
          {load.provenance.counts.malformedAssessments > 0 && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 leading-relaxed">
              {t('provenance.malformedCount', { count: load.provenance.counts.malformedAssessments })}
            </p>
          )}

          {/* Surfaced at the top, above the timeline: a thesis published over a
              recorded objection is the most important thing in this record, and
              a "published" badge says nothing about it. */}
          {load.provenance.recordedDissent.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
              <div className="text-xs font-semibold text-red-800">{t('provenance.dissentHeading')}</div>
              <p className="text-xs text-red-700 leading-relaxed">{t('provenance.dissentExplain')}</p>
              <ul className="space-y-1.5">
                {load.provenance.recordedDissent.map((d) => (
                  <li key={d.eventId} className="text-xs text-red-800 leading-relaxed bg-white/70 rounded p-2" dir="auto">
                    {d.objection}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {load.provenance.sessions.map((s) => (
            <SessionBlock key={s.id} session={s} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
