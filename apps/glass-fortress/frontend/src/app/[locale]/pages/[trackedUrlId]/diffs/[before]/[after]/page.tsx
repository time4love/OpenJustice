import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { readPublic } from '@/lib/api';
import { parseDiffInput } from '@/lib/corpusBody';
import { textDiff } from '@/lib/textDiff';
import { domainOf, formatCaptureDate } from '@/lib/format';
import { RecordContent } from '@/components/record/RecordContent';
import { DiffRuns } from '@/components/record/DiffRuns';
import { LabelledOpinion } from '@/components/opinion/LabelledOpinion';
import { CitingTheses } from '@/components/record/CitingTheses';
import type { DiffInput } from '@/types/corpus';

// ---------------------------------------------------------------------------
// ONE DIFF, WHOLE — docs/gf-ui-flows.md §26 :852–:856; A1 :1124; A2 :1153; UI plan :641–:644.
//
// THE 409 IS A STATE THIS READ NAMED, not a failure. `readPublic(..., { answers: [409] })` is the ruling
// "a caller names the statuses that are answers" applied to the server door (2026-09-19), the same opt-in
// `fetchJson` carries for the chain check — one read, one wrapper, one cache decision, never a second door.
// AWAITING_DERIVATION means the walk owes a re-derivation of this pair's content; the page is already public
// and the state is the corpus's, not a secret (§6 :267), so it renders as a STATEMENT with both capture links
// STILL LIVE: what a reader came for is the two captures, and those exist whatever the derivation owes.
//
// THE INLINE DIFF IS UI-5'S `textDiff`, CALLED. It is the SAME two-input function the thesis history uses
// (`lib/textDiff.ts`, a KEEP file), over `before.text` and `after.text` — the two texts this route already
// carries. A second differ on this page would be a second answer to "what changed", and the one thing a
// forensic record may not have is two answers.
//
// THE HEADING IS TWO DATES. `record.diff` takes `{before, after}` and both are FORMATTED (§4): a 14-digit
// archive timestamp is an id, and an id is never rendered as text.
//
// THE THREE ROW FIELDS ARE HERE NOW, and this note used to say they were not. `get_diff_input` sent
// `{ page, before, after, current }` and nothing else, so §26 :852–:856's "the opinion labelled",
// `narrowed` and the citing theses were reported as a gap rather than drawn from a second read (§8 :344).
// The researcher RULED the envelope on 2026-09-20 (A4 :1096): the answer is THE DIFF ROW PLUS THE TWO
// TEXTS, built by `diffRow` — `list_findings`' own builder — so the three fields are the same values the
// corpus stream shows for the same diff, and the two surfaces cannot give two accounts of one record.
//
// ONE PART OF THAT CLAUSE IS STILL OWED, and A4 :1096 now records it: `narrowed` is the MARK, and the
// INTERVENING CAPTURES behind it are served by no read. So the mark is drawn and the list is not —
// `record.pair.narrowedWith` names that list and stays unused.
//
// NO CHAIN CONTROL HERE. The chain check is a check on a CAPTURE (A4 :1111–:1114); a reader who wants it
// follows either endpoint link to its capture page, where it already is.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; trackedUrlId: string; before: string; after: string }>;
}

/** The read's two outcomes this page draws: the pair, or the derivation it still owes. */
type PairRead = { status: 200; body: DiffInput } | { status: 409 };

async function read(trackedUrlId: string, before: string, after: string): Promise<PairRead> {
  const answer = await readPublic(`/api/pages/${trackedUrlId}/diffs/${before}/${after}`, parseDiffInput, { answers: [409] });
  // NOT_SURVEYED · NOT_PUBLIC · NOT_A_CAPTURE · NO_SUCH_DIFF all arrive as the public door's ONE 404 body
  // (§6 :266), so this page cannot tell them apart and must not try.
  if (answer.status === 404) notFound();
  if (answer.status === 400) {
    throw new Error(`the diff page: /api/pages/${trackedUrlId}/diffs/${before}/${after} answered 400 — this read sends no filters, so a refused parameter is a defect, not a state`);
  }
  return answer;
}

export default async function DiffPage({ params }: PageParams) {
  const { locale, trackedUrlId, before, after } = await params;
  const answer = await read(trackedUrlId, before, after);
  const t = await getTranslations('record');
  const pair = await getTranslations('record.pair');
  const corpus = await getTranslations('corpus');
  const record = await getTranslations('record.record');

  const heading = t('diff', { before: formatCaptureDate(before, locale), after: formatCaptureDate(after, locale) });
  // THE DOMAIN LINE EXISTS ONLY WHERE A BODY DOES. The 409 answers with a status and nothing else (ui
  // §6 :267, and `readPublic`'s 409 member carries no body BY RULING), so the AWAITING state has no
  // `page.url` to compose a domain from and no second read is permitted to fetch one (§8 :344). The line
  // is therefore ABSENT in that state rather than invented. REPORTED as a gap: §26 :855 describes the
  // state without saying what heads it.
  const domain = answer.status === 200 ? domainOf(answer.body.page.url) : undefined;
  // BOTH LINKS ARE COMPOSED FROM THE URL'S OWN SEGMENTS, so they are live in the 409 state too — where there
  // is no body to read them from.
  const links = (
    <p className="record-links">
      <Link href={`/pages/${trackedUrlId}/captures/${before}`} className="underline">
        {pair('openBefore')}
      </Link>
      <Link href={`/pages/${trackedUrlId}/captures/${after}`} className="underline">
        {pair('openAfter')}
      </Link>
    </p>
  );

  if (answer.status === 409) {
    // THE STATE IS A RECORD WITH ITS BYTES OWED, so it is drawn by the component that draws records —
    // `RecordContent`'s AWAITING arm, which `types/record.ts` created for exactly this ("AWAITING carries
    // its statement from the surface", the statement being the already-approved `corpus.awaitingDerivation`
    // rather than a second key for one sentence). A hand-drawn heading and paragraph here would be a SECOND
    // renderer of a record's head — one that drifts from the 200 branch, and one that would drop the domain
    // line precisely when a reader has no bytes to tell them which page they are on.
    return (
      <main className="page-column reading space-y-4 py-8" data-awaiting>
        <RecordContent domain={domain} heading={heading} content={{ kind: 'AWAITING', statement: corpus('awaitingDerivation') }} />
        {links}
      </main>
    );
  }

  const body = answer.body;
  const runs = textDiff(body.before.text, body.after.text);

  return (
    <main className="page-column reading space-y-4 py-8">
      <RecordContent
        domain={domainOf(body.page.url)}
        heading={heading}
        content={{ kind: 'DIFF', chunks: body.current.chunks.map((chunk) => ({ side: chunk.side, text: chunk.text })) }}
      >
        {/* THE TWO TEXTS AS ONE INLINE DIFF, above the stored chunks: the bytes as they read, then the walk's
            own derivation of what changed in them. */}
        <p className="record-meta">{pair('inline')}</p>
        <p dir="auto" className="record-captured whitespace-pre-wrap">
          <DiffRuns runs={runs} />
        </p>
        <p className="record-meta">{pair('chunks')}</p>
      </RecordContent>

      {/* THE NARROWED MARK — `corpus.narrowed` CALLED, the word the stream and the sheet already use for
          this fact about this record. THE INTERVENING CAPTURES ARE NOT DRAWN: §26 :854 asks for them "as
          links" and no read serves them — `narrowed` is the MARK and not the list (A4 :1096's own ruling,
          "the intervening captures behind `narrowed` are served by no read and stay owed"). Drawing an
          empty list under a heading would tell a reader nothing intervened, which is the opposite of what
          the mark says. `record.pair.narrowedWith` names that undrawable list and stays UNUSED. */}
      {body.narrowed ? (
        <p className="record-marks">
          <span data-narrowed-mark>{corpus('narrowed')}</span>
        </p>
      ) : null}

      {/* THE THIRD VOICE, and only inside its label (§10 :384, "Never outside one"). `LabelledOpinion`
          carries `classifierVersion` beside the label itself, so nothing here re-spells it. */}
      {body.opinion === null ? null : <LabelledOpinion opinion={body.opinion} />}

      {/* THE CITING PUBLISHED THESES (A4 :1090 — published versions only), through the ONE component the
          corpus record sheet already draws them with. `record.record.citedBy` heads the list with the
          sentence the records page uses for the same thing; the links' own words are the CITED mark's. */}
      {body.evidence === null || body.evidence.citedBy.length === 0 ? null : (
        <section>
          <p className="record-meta">{record('citedBy')}</p>
          <CitingTheses evidence={body.evidence} />
        </section>
      )}

      {links}
    </main>
  );
}
