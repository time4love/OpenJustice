import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readUnfiltered } from '@/lib/api';
import { parseCaptureRead } from '@/lib/corpusBody';
import { archiveUrl, rawArchiveUrl } from '@/lib/archiveUrl';
import { domainOf, formatCaptureDate } from '@/lib/format';
import { CopyableCode } from '@/components/CopyableCode';
import { RecordContent } from '@/components/record/RecordContent';
import { CaptureChainCheck } from '@/components/record/CaptureChainCheck';
import { Fold } from '@/components/thesis/Fold';
import type { CaptureRead } from '@/types/corpus';

// ---------------------------------------------------------------------------
// ONE CAPTURE, WHOLE — docs/gf-ui-flows.md §26 :827–:834; A1 :1123; UI plan :634–:640.
//
// A SERVER COMPONENT WITH ONE READ. `get_capture` at `GET /api/pages/:trackedUrlId/captures/:capture` answers
// the row AND the bytes (evidence A4 :1082), so nothing else is fetched to draw this page. `readUnfiltered`
// rather than `readPublic`: this page sends no filters, so a 400 means the platform built a malformed URL and
// is a defect rather than a state (§A2's 400 row belongs to pages that HAVE chips).
//
// THE ONE 404 IS A STATUS AND NOT ONLY A SENTENCE. `notFound()` from `next/navigation`
// (01-app/01-getting-started/10-error-handling.md §"Not found") renders this segment's `not-found.tsx` with a
// real 404. The public door already collapses NOT_SURVEYED · NOT_A_CAPTURE · NOT_PUBLIC into one
// `{ error: 'Not found' }` body (§6 :266), so a stranger learns nothing about which of the three it was, and
// this page could not tell them apart even if it wanted to.
//
// A RECORD PAGE IS NOT A THESIS PAGE — „דף רשומה הוא לא דף תזה" (§26 :820, the researcher, 2026-09-19). There
// is NO legal disclaimer here: `COMPLIANCE.md` :92 names a thesis page and a call page and nothing else.
//
// NOTHING IS RE-VERIFIED IN THE BROWSER (§21 :629) and no reader is told to hash anything (§26 :834, :836–:850).
// The VERIFY disclosure names the RAW archive form beside the `documentHash` it matches, closed by default,
// "for the reader who came to check" — and that is the only place the raw form appears.
//
// `params` IS A PROMISE and is awaited (01-app/03-api-reference/03-file-conventions/page.md :46–:64).
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; trackedUrlId: string; capture: string }>;
}

async function read(trackedUrlId: string, capture: string): Promise<CaptureRead> {
  const answer = await readUnfiltered(`/api/pages/${trackedUrlId}/captures/${capture}`, parseCaptureRead);
  if (answer.status === 404) notFound();
  return answer.body;
}

export default async function CapturePage({ params }: PageParams) {
  const { locale, trackedUrlId, capture } = await params;
  const body = await read(trackedUrlId, capture);
  const t = await getTranslations('record');
  const copy = await getTranslations('corpus');
  const anchor = await getTranslations('corpus.anchor');
  const verify = await getTranslations('record.verify');
  const archive = await getTranslations('record.archive');
  const theses = await getTranslations('theses.verify');

  const row = body.capture;
  // THE HEADING IS THE PAGE AND ITS DATE — never the 14-digit timestamp, which is an id (§4; `no-id-as-text`).
  const heading = t('capture', { date: formatCaptureDate(row.capture, locale) });

  return (
    <main className="page-column reading space-y-4 py-8">
      <RecordContent domain={domainOf(body.page.url)} heading={heading} content={{ kind: 'CAPTURE', text: body.text }}>
        {/* THE ANCHOR AS A MARK, and ATTRIBUTED — both fields of the body, neither derived here. */}
        <p className="record-marks">
          <span data-anchor-mark>{row.anchor.attributed ? anchor('attributed') : anchor('notYet')}</span>
        </p>
      </RecordContent>

      {/* THE COPY OF THE CITATION TOKEN — labelled by what it is FOR (§4 :170–:176), with the word the
          stream and the sheet already use for the same control. `record.openRecord` is the LINK ONWARD's
          word and says the press will open something, which this one does not. */}
      <CopyableCode value={`#ev_${row.fileHash}`} label={copy('copyToken')} />

      {/* VERIFY, CLOSED BY DEFAULT — "for the reader who came to check" (§4 :175–:179). `data-verify` is what
          lets exact values be READ here and nowhere else. */}
      <Fold summary={theses('summary')} verify>
        <ul className="record-meta space-y-1">
          <li>
            {verify('documentHash')} · <bdi dir="ltr">{row.anchor.documentHash}</bdi>
          </li>
          <li>
            {verify('textHash')} · <bdi dir="ltr">{body.textHash}</bdi>
          </li>
          {/* WHICH EXTRACTION THE BYTES ARE — stated by the read, never assumed (§26 :829). It is beside the
              two hashes because a hash without the extraction that produced it names bytes nobody can find
              again after a re-extraction. */}
          <li>
            {verify('extraction')} · <bdi dir="ltr">{row.textExtractionVersion}</bdi>
          </li>
          <li>
            {verify('rawArchive')} · <bdi dir="ltr">{rawArchiveUrl(body.page.url, row.capture)}</bdi>
          </li>
        </ul>
        {/* WHY THE TWO FORMS DIFFER, and NOT an instruction to hash: the viewer form carries the archive's own
            toolbar, so a reader who hashed the link they were given would get a mismatch. */}
        <p className="record-meta">{verify('how')}</p>
      </Fold>

      {/* THE SECOND WITNESS — the VIEWER form, composed and never fetched (evidence §5 :428–:430). */}
      <p className="record-links">
        <a href={archiveUrl(body.page.url, row.capture)} rel="noreferrer" target="_blank" className="underline">
          {archive('link')}
        </a>
      </p>
      <p className="record-meta">{archive('line')}</p>

      <CaptureChainCheck trackedUrlId={trackedUrlId} capture={row.capture} />
    </main>
  );
}
