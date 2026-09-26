import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { readUnfiltered } from '@/lib/api';
import { parseRecordAnswer } from '@/lib/corpusBody';
import { domainOf, formatCaptureDate } from '@/lib/format';
import { ResearcherProse } from '@/components/thesis/ResearcherProse';
import type { RecordNames, ReservedDocument, ResolvedRecord } from '@/types/corpus';

// ---------------------------------------------------------------------------
// WHAT A STRANGER HOLDING A CITATION NEEDS — docs/gf-ui-flows.md §26 :858–:861; A1 :1125; A4 :1106; UI plan
// :645–:648.
//
// THE READER ARRIVED BY A NAME AND HOLDS NOTHING ELSE. That is the whole shape of this page: someone read
// `#ev_0x…` in a published thesis, or was handed the token by a journalist, and has no page, no date and no
// context. So the page answers what the name resolves to and then gets out of the way — and the ONE LINK
// ONWARD is the point of it, which is why `page.trackedUrlId` was ruled onto this envelope on 2026-09-20
// (A4 :1106): without it the link has no source and a stranger can go nowhere.
//
// IT COMPUTES NO VERDICT (§21 :629; §8 :334). RECOMPUTABLE and VERIFIED are fields; `notEvaluable` is shown
// as the REASON it is and never as a failure (§18 :574) — "not asked" and "asked and failed" are different
// statements and this page may not merge them.
//
// A `#doc_` NAME RENDERS THE RESERVED SENTENCE AND NOTHING ELSE — and so does a bare COMMITMENT, which the backend
// answers with document flows §7 :848–:860's block since document step 34 (R85 Q-C). Drawing that block is the
// frontend's own change (document plan :280–:282); until it lands this page says the name is reserved rather than
// drawing any of it, and a document body is never a 500.
//
// NO DISCLAIMER (§26 :820, „דף רשומה הוא לא דף תזה"), no anchor to any door, and no chain control — the
// chain is a check on a CAPTURE (A4 :1111–:1114) and lives on the capture page, one link away.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; fileHash: string }>;
}

/** A document commitment's name — the one shape this page answers without resolving anything. */
const DOCUMENT_NAME = /^#?doc_/;

/** The record's own page: a capture's, or the pair's. Composed from the two fields A4 :1106 carries. */
function recordHref(trackedUrlId: string, record: RecordNames): string {
  return 'capture' in record
    ? `/pages/${trackedUrlId}/captures/${record.capture}`
    : `/pages/${trackedUrlId}/diffs/${record.before}/${record.after}`;
}

/** The record's endpoints as DATES — the clause's "timestamps" are archive names, and an id is never text. */
function endpointDates(record: RecordNames, locale: string): string {
  return 'capture' in record
    ? formatCaptureDate(record.capture, locale)
    : `${formatCaptureDate(record.before, locale)} – ${formatCaptureDate(record.after, locale)}`;
}

async function read(fileHash: string): Promise<ResolvedRecord | ReservedDocument> {
  const answer = await readUnfiltered(`/api/records/${fileHash}`, parseRecordAnswer);
  // NOT_A_RECORD and NOT_PUBLIC arrive as the public door's ONE 404 body (§6 :266).
  if (answer.status === 404) notFound();
  return answer.body;
}

export default async function RecordPage({ params }: PageParams) {
  const { locale, fileHash } = await params;
  const t = await getTranslations('record.record');
  const marks = await getTranslations('theses.marks');
  const anchor = await getTranslations('corpus.anchor');
  const record = await getTranslations('record');

  const reserved = (
    <main className="page-column reading space-y-4 py-8" data-document-reserved>
      <p className="record-meta">{t('documentReserved')}</p>
    </main>
  );
  if (DOCUMENT_NAME.test(fileHash)) return reserved;

  const body = await read(fileHash);
  if (body.kind === 'DOCUMENT') return reserved;
  const verified = body.verified;

  return (
    // `reading` — the record IS the read on this page, as the thesis page's <article> is there: it opts
    // the region in to the reading column and size once, and the chrome around it is untouched.
    <main className="page-column reading space-y-4 py-8">
      <p className="record-head">
        <bdi dir="ltr">{domainOf(body.page.url)}</bdi>
      </p>
      <h1 dir="auto" className="record-title">
        {t('heading')}
      </h1>

      {/* THE KIND AND THE ENDPOINTS, as words and dates — never the 14-digit names, which are ids (§4). */}
      <p className="record-meta">
        {body.kind === 'CAPTURE' ? t('kindCapture') : t('kindDiff')} · <bdi dir="ltr">{endpointDates(body.record, locale)}</bdi>
      </p>

      {/* RECOMPUTABLE AS A MARK — a field of the body, not a check this page ran. */}
      <p className="record-marks">
        <span data-recomputable-mark>{body.recomputable ? t('recomputable') : t('notRecomputable')}</span>
      </p>

      {'notEvaluable' in verified ? (
        // THE REASON IT CANNOT BE ASKED, AND NO WORDS AT ALL (§18 :574). A record nobody promoted has not
        // failed its check; it has not been put to one. „אינו מאומת מול העוגן" is a VERDICT and borrowing
        // it here would report a check that never ran — the fabrication class this platform refuses, in
        // one sentence. There is no approved sentence for "not evaluable" yet, so the arm carries the
        // machine-readable reason for an instrument and stays SILENT for a reader until one is frozen.
        //
        // THE ATTRIBUTE IS ON THE ROW AND THERE IS NO CHILD SPAN, which is not a detail: `.record-marks >
        // span` is a PILL (`globals.css`, 2026-09-20), so an empty span inside this row drew an 18 × 6 px
        // capsule — a visible border around nothing, measured on staging. Silence has to be silent in the
        // rendering too, or it is not silence but a glitch. W-24 sweeps every arm of all three pages for
        // exactly this shape.
        <p className="record-marks" data-not-evaluable={verified.notEvaluable} />
      ) : (
        <ul className="record-meta space-y-1" data-verified={String(verified.verified)}>
          {verified.captures.map((capture) => (
            <li key={capture.capture} data-capture-row={capture.capture}>
              <bdi dir="ltr">{formatCaptureDate(capture.capture, locale)}</bdi> ·{' '}
              {capture.attributed === true ? anchor('attributed') : anchor('notYet')}
              {capture.anchoredHashMatchesDocumentHash ? ` · ${record('hashMatches')}` : ''}
            </li>
          ))}
          <li>{verified.verified ? marks('verified') : t('notVerified')}</li>
        </ul>
      )}

      {/* THE PUBLISHED VERSIONS THAT CITE IT, each with FLAGGED where the REPORT says so, and its text in
          the researcher's own voice and face — their words rendered as given (§16 :517–:521). */}
      {body.citedBy.length === 0 ? null : (
        <section data-citing-versions className="space-y-3">
          <p className="record-meta">{t('citedBy')}</p>
          {body.citedBy.map((citation) => (
            <article key={citation.versionId} className="space-y-1">
              {citation.flagged.flagged ? (
                <p className="record-marks">
                  <span data-flagged-mark>{t('flagged')}</span>
                </p>
              ) : null}
              <ResearcherProse text={citation.text} links="text" />
            </article>
          ))}
        </section>
      )}

      {/* THE ONE LINK ONWARD (§26 :860), composed from the page's id and the record's own endpoints. */}
      <p className="record-links">
        <Link href={recordHref(body.page.trackedUrlId, body.record)} className="underline">
          {record('openRecord')}
        </Link>
      </p>
    </main>
  );
}
