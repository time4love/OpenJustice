import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { TEXT_EXTRACTION_VERSION } from '../../lib/captureDocument';
import { fetchCaptureBytes, isTransientFetchFailure, SNAPSHOT_MAX_RETRIES, WaybackFetchError } from '../../lib/archiveHttp';
import { segments } from '../../lib/claimSurvival';
import type { deriveTextUnderRuleset } from '../../lib/chromeRulesetApply';
import type { CurrentExtraction } from '../../lib/extractionDrift';
import { ForensicAgent } from '../../services/ForensicAgent';
import {
  acceptedCaptures,
  inTimestampOrder,
  knownText,
  nextRow,
  predecessor,
  rulesInForce,
  rulesetIdAt,
  seen,
  type CaptureRemovals,
  type Decision,
  type Rule,
} from '../derivations';
import { evaluateCapture, type Derived, type Matched } from '../evaluate';
import type { Classify } from '../gates';
import { markingUrl } from '../markingUrl';
import { answer, refusal, shared, type Refusal } from '../refusals';
import { loadWorkListRows, snapshotDateOf, type LoadedRow } from '../rows';
import { pendingStopOf, type StopGate } from '../stop';

// ---------------------------------------------------------------------------
// scan_captures({ url, maxCaptures }) — docs/gf-interaction-flows.md A5, Phase 2
// and Flow 3: the walk. REFACTOR STEP 4 BUILDS THE REPORTING FORM: every step of
// the walk EXCEPT the writes — the digest shortcut, the fetch, the derivation,
// the comparison, all five gates through `evaluateCapture`, the stop's material
// and the marking URL — reported, storing NOTHING. No row is updated, no bytes
// are held, no snapshot, no diff, no anchor, no decision, no RuleMatch. Step 5
// adds the writes to THIS handler (plan §3; R-D, 2026-09-05).
//
// THE WALK'S WORKING STATE IS AN IN-MEMORY VIEW OF THE PAGE'S ROWS, updated as
// it goes, so a later row in the chunk sees an earlier row's outcome exactly as
// the writing walk will — the IDENTICAL shortcut against a row this call just
// judged, the predecessor a row this call just found novel. Step 5 persists
// each update; the view stays. Until then a second call answers as the first,
// because nothing moved.
//
// THE PREDECESSOR IS RE-DERIVED from its snapshot's document under
// RULES_IN_FORCE at ITS timestamp (Q4, 2026-09-05): one derivation supplies its
// kept and removed sides AND its match counts, keyed to the rule; a rule whose
// selector the parser rejected has no count, and Gate 2 throws on the absence.
// A capture this call found novel is remembered as derived, so it can be the
// next row's predecessor. `deriveTextUnderRuleset` is ESM-only through jsdom
// and is loaded by dynamic import once per call, never at module load (§8).
//
// SEEN IS FOLDED ONCE PER CALL (ruled 2026-09-05): the removed sides of the
// ACQUIRED captures a human has ACCEPTED, split by `segments` — the gates'
// splitter — into one map; each row is judged against the union of every
// capture but ITSELF. The PENDING capture being judged never contributes: its
// removals being on the marking page's screen is display state, not Gate 4's
// input. No cache: a cache is state, and this step writes none.
//
// SPEND: one classifier call per NOVEL capture that reaches Gate 5 — quiet on
// Gates 0–4, not RESOLVED. The reporting form makes no other call: a RESOLVED
// novel capture's diff is classified at ACQUISITION, which is step 5's write.
// The classifier is handed no correlated evidence: the editorial question is
// answered from the text alone (R-C's prompt), and correlation is the stored
// diff's concern at step 5.
// ---------------------------------------------------------------------------

export const scanCapturesSchema = {
  url: z.url().describe('The page — exact URL'),
  maxCaptures: z
    .number()
    .int()
    .describe('How many work-list rows this call may walk before returning; the walk resumes from NEXT_ROW'),
};

interface ScanInput {
  url: string;
  maxCaptures: number;
}

/** A5's six counts, zero-filled — would-be outcomes until step 5 writes them. */
interface Outcomes {
  identical: number;
  duplicate: number;
  acquired: number;
  unservable: number;
  superseded: number;
  restamped: number;
}

interface StopWithUrl {
  capture: string;
  gates: StopGate[];
  markingUrl: string;
}

interface ScanResult {
  walked: number;
  outcomes: Outcomes;
  stop: StopWithUrl | null;
  next: string | null;
}

/** A5's ARCHIVE_UNAVAILABLE answer: the refusal, the row it stopped at, and what was done before it. */
interface ArchiveUnavailable extends Refusal {
  capture: string;
  walked: number;
  outcomes: Outcomes;
  next: string;
}

/** The bytes a capture is judged from, and whether the archive served them just now. */
interface Bytes {
  bytes: Buffer;
  contentType: string | null;
  contentEncoding: string | null;
  fresh: boolean;
}

/** One capture's derivation, memoised for the call. */
interface Extraction {
  textHash: string;
  textExtractionVersion: string;
  current: CurrentExtraction;
  matches: Matched[];
}

/** What `prepare` loads before a capture is evaluated: its bytes, its own approved text, its predecessor. */
interface Prepared {
  bytes: Bytes;
  approvedText: { keptText: string } | null;
  predecessor: LoadedRow | null;
}

type Derive = typeof deriveTextUnderRuleset;

const zeroOutcomes = (): Outcomes => ({
  identical: 0,
  duplicate: 0,
  acquired: 0,
  unservable: 0,
  superseded: 0,
  restamped: 0,
});

/** UNSERVABLE on a refusal the archive will repeat; UNAVAILABLE on one it may not; null when the error is not the archive's. */
function fetchFailure(err: unknown): 'UNSERVABLE' | 'UNAVAILABLE' | null {
  if (!(err instanceof WaybackFetchError)) return null;
  return isTransientFetchFailure(err) ? 'UNAVAILABLE' : 'UNSERVABLE';
}

export async function scanCapturesHandler(input: ScanInput): Promise<string> {
  return answer(async (): Promise<ScanResult | ArchiveUnavailable | Refusal> => {
    const researcherId = getResearcherId();
    if (researcherId === null) return shared.noResearcher('scan_captures');
    if (input.maxCaptures < 1) {
      return refusal(
        'INVALID_MAX_CAPTURES',
        `maxCaptures must be at least 1; ${String(input.maxCaptures)} walks nothing.`,
      );
    }
    const page = await prisma.trackedUrl.findUnique({ where: { url: input.url } });
    if (page === null) return shared.notSurveyed(input.url);

    const stored = await loadWorkListRows(prisma, page.id);
    const rules: Rule[] = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
    const decisions: Decision[] = await prisma.pageDecision.findMany({
      where: { trackedUrlId: page.id },
      orderBy: { sequence: 'asc' },
    });

    // A stop already pending is returned VERBATIM from its row; nothing walks.
    for (const row of inTimestampOrder(stored)) {
      const pending = pendingStopOf(row);
      if (pending !== null) {
        return {
          walked: 0,
          outcomes: zeroOutcomes(),
          stop: {
            capture: row.waybackTimestamp,
            gates: pending.gates,
            markingUrl: markingUrl(page.id, row.waybackTimestamp),
          },
          next: row.waybackTimestamp,
        };
      }
    }

    const { deriveTextUnderRuleset } = await import('../../lib/chromeRulesetApply');
    return new PageWalk(page.id, input.url, stored, rules, decisions, deriveTextUnderRuleset).run(input.maxCaptures);
  });
}

class PageWalk {
  private readonly view: Map<string, LoadedRow>;
  private readonly extractions = new Map<string, Extraction>();
  private removedByAccepted: Map<string, readonly string[]> | null = null;
  private agent: ForensicAgent | null = null;
  private readonly outcomes = zeroOutcomes();
  private walked = 0;

  constructor(
    private readonly trackedUrlId: string,
    private readonly url: string,
    stored: readonly LoadedRow[],
    private readonly rules: readonly Rule[],
    private readonly decisions: readonly Decision[],
    private readonly derive: Derive,
  ) {
    this.view = new Map(stored.map((row) => [row.waybackTimestamp, { ...row }]));
  }

  private rows(): LoadedRow[] {
    return inTimestampOrder([...this.view.values()]);
  }

  /** What this call decided about a row — the write step 5 adds; kept in the view meanwhile. */
  private decide(row: LoadedRow, change: Partial<LoadedRow>): void {
    this.view.set(row.waybackTimestamp, { ...row, ...change });
  }

  async run(maxCaptures: number): Promise<ScanResult | ArchiveUnavailable> {
    while (this.walked < maxCaptures) {
      const row = nextRow(this.rows(), this.rules, this.decisions, TEXT_EXTRACTION_VERSION);
      if (row === null) break;
      const halted = await this.step(row);
      if (halted !== null) return halted;
    }
    const next = nextRow(this.rows(), this.rules, this.decisions, TEXT_EXTRACTION_VERSION);
    return { walked: this.walked, outcomes: this.outcomes, stop: null, next: next?.waybackTimestamp ?? null };
  }

  /** One capture: the shortcut, the bytes, the gates, the would-be outcome. Returns what ends the call, or null to go on. */
  private async step(row: LoadedRow): Promise<ScanResult | ArchiveUnavailable | null> {
    const rows = this.rows();
    const t = row.waybackTimestamp;

    // The IDENTICAL shortcut: same digest as the preceding row, whose text is
    // KNOWN — nothing fetched, nothing derived. OFF for the page while any row
    // carries digestVerified = false. Only a row we hold no bytes for takes it.
    if (row.outcome === 'UNFETCHED' && !rows.some((r) => r.digestVerified === false)) {
      const index = rows.findIndex((r) => r.waybackTimestamp === t);
      const preceding = index > 0 ? rows.at(index - 1) : undefined;
      if (preceding?.digest === row.digest && knownText(preceding)) {
        this.decide(row, { outcome: 'IDENTICAL', comparedTo: preceding.waybackTimestamp });
        this.outcomes.identical += 1;
        this.walked += 1;
        return null;
      }
    }

    const prepared = await this.prepare(row, rows);
    if (prepared === 'UNSERVABLE') {
      this.decide(row, { outcome: 'UNSERVABLE', fetchedAt: new Date() });
      this.outcomes.unservable += 1;
      this.walked += 1;
      return null;
    }
    if (prepared === 'UNAVAILABLE') {
      return {
        ...refusal(
          'ARCHIVE_UNAVAILABLE',
          `The archive did not serve capture ${t}; the row stays UNFETCHED and the walk stops here. Everything before it is kept.`,
        ),
        capture: t,
        walked: this.walked,
        outcomes: this.outcomes,
        next: t,
      };
    }
    const { bytes, approvedText, predecessor: pred } = prepared;
    const before = pred === null ? null : this.extractionOf(pred);

    // ONE derivation of this capture per step, parsed on first need — by
    // `derive`, by the `novel` getter, or by the would-be outcome.
    let mine: Extraction | null = null;
    const extraction = (): Extraction => {
      mine ??= this.extract(t, bytes);
      return mine;
    };
    let derived: Derived | null = null;
    const deriveOnce = (): Derived => {
      derived ??= {
        previous: before === null ? null : { keptText: before.current.keptText, removedText: before.current.removedText },
        current: extraction().current,
        matches: { p: before === null ? null : before.matches, c: extraction().matches },
        seen: this.seenExcluding(t),
        ownPrevious: approvedText,
      };
      return derived;
    };
    const novel = (): boolean => before?.textHash !== extraction().textHash;

    const stop = await evaluateCapture({
      t,
      rules: this.rules,
      decisions: this.decisions,
      row,
      predecessor: pred?.waybackTimestamp ?? null,
      fetched: bytes.fresh ? { bytes: bytes.bytes, expectedDigest: row.digest } : null,
      derive: deriveOnce,
      // A getter, because the contract fixes `novel: boolean` and Gate 5 is the
      // only reader: it parses on first read, so a Gate 0 or RESOLVED answer
      // derives nothing.
      get novel() {
        return novel();
      },
      classify: this.classify(t),
    });

    const digestVerified = bytes.fresh ? stop?.gates.at(0)?.gate !== 'DIGEST' : row.digestVerified;
    if (stop !== null) {
      // The stop itself is returned, not kept on the view: the call ends here,
      // so nothing reads it back; step 5 writes it onto the row as Json.
      this.decide(row, { outcome: 'PENDING_JUDGEMENT', digestVerified });
      this.walked += 1;
      return {
        walked: this.walked,
        outcomes: this.outcomes,
        stop: { ...stop, markingUrl: markingUrl(this.trackedUrlId, t) },
        next: t,
      };
    }

    // Quiet, or RESOLVED: the would-be outcome. Step 5 stores, anchors and
    // writes the diff here; the reporting form records what it would have done.
    const stamp = {
      rulesetId: rulesetIdAt(this.rules, this.decisions, t),
      textHash: extraction().textHash,
      textExtractionVersion: extraction().textExtractionVersion,
      digestVerified,
    };
    if (row.outcome === 'ACQUIRED') {
      const changed = extraction().textHash !== row.textHash;
      this.decide(row, stamp);
      this.extractions.set(t, extraction());
      this.outcomes[changed ? 'superseded' : 'restamped'] += 1;
    } else if (novel()) {
      this.decide(row, { ...stamp, outcome: 'ACQUIRED', comparedTo: pred?.waybackTimestamp ?? null });
      this.extractions.set(t, extraction());
      this.outcomes.acquired += 1;
    } else {
      this.decide(row, { ...stamp, outcome: 'DUPLICATE', comparedTo: pred?.waybackTimestamp ?? null });
      this.outcomes.duplicate += 1;
    }
    this.walked += 1;
    return null;
  }

  /**
   * The reads a capture needs before it is judged, done once: its bytes (held
   * on a PENDING row, the snapshot's document on an ACQUIRED row, else a fresh
   * raw fetch), its own approved text when it has one, and its predecessor,
   * loaded and derived so `derive` can be synchronous. Reads only — the walk
   * spends nothing before the gates.
   */
  private async prepare(
    row: LoadedRow,
    rows: readonly LoadedRow[],
  ): Promise<Prepared | 'UNSERVABLE' | 'UNAVAILABLE'> {
    const pred = predecessor(rows, row);
    if (pred !== null) await this.ensureExtracted(pred);
    await this.foldSeen(rows);

    if (row.outcome === 'ACQUIRED') {
      const snapshot = await this.snapshotOf(row);
      return {
        bytes: {
          bytes: snapshot.document,
          contentType: snapshot.documentContentType,
          contentEncoding: snapshot.documentContentEncoding,
          fresh: false,
        },
        approvedText: { keptText: snapshot.text },
        predecessor: pred,
      };
    }
    if (row.outcome === 'PENDING_JUDGEMENT' && row.heldBody !== null) {
      return {
        bytes: {
          bytes: Buffer.from(row.heldBody),
          contentType: row.contentType,
          contentEncoding: row.contentEncoding,
          fresh: false,
        },
        approvedText: null,
        predecessor: pred,
      };
    }
    try {
      const fetched = await fetchCaptureBytes(this.url, row.waybackTimestamp, { maxRetries: SNAPSHOT_MAX_RETRIES });
      return { bytes: { ...fetched, fresh: true }, approvedText: null, predecessor: pred };
    } catch (err) {
      const failure = fetchFailure(err);
      if (failure === null) throw err;
      return failure;
    }
  }

  private async snapshotOf(row: LoadedRow): Promise<{
    document: Buffer;
    documentContentType: string | null;
    documentContentEncoding: string | null;
    text: string;
  }> {
    if (row.snapshotId === null) {
      throw new Error(`Walk defect: capture ${row.waybackTimestamp} is ACQUIRED and names no snapshot.`);
    }
    const snapshot = await prisma.urlSnapshot.findUnique({
      where: { id: row.snapshotId },
      select: { document: true, documentContentType: true, documentContentEncoding: true, text: true },
    });
    if (snapshot === null) {
      throw new Error(
        `Walk defect: capture ${row.waybackTimestamp} names snapshot ${row.snapshotId}, which does not exist.`,
      );
    }
    return { ...snapshot, document: Buffer.from(snapshot.document) };
  }

  /** A stored ACQUIRED capture's extraction, loaded and derived once per call. */
  private async ensureExtracted(row: LoadedRow): Promise<void> {
    if (this.extractions.has(row.waybackTimestamp)) return;
    const snapshot = await this.snapshotOf(row);
    this.extractions.set(
      row.waybackTimestamp,
      this.extract(row.waybackTimestamp, {
        bytes: snapshot.document,
        contentType: snapshot.documentContentType,
        contentEncoding: snapshot.documentContentEncoding,
        fresh: false,
      }),
    );
  }

  private extractionOf(row: LoadedRow): Extraction {
    const known = this.extractions.get(row.waybackTimestamp);
    if (known === undefined) {
      throw new Error(`Walk defect: capture ${row.waybackTimestamp} was compared against before it was derived.`);
    }
    return known;
  }

  /** Derive one capture under RULES_IN_FORCE at ITS timestamp; the counts come from the same derivation, keyed to the rule. */
  private extract(t: string, bytes: Bytes): Extraction {
    const inForce = rulesInForce(this.rules, this.decisions, t);
    const derived = this.derive(bytes.bytes, bytes.contentType, bytes.contentEncoding, {
      selectors: inForce.map((r) => r.selector),
    });
    const counts = new Map(Object.entries(derived.chrome.matchCounts));
    const matches = inForce.flatMap((r) => {
      const n = counts.get(r.selector);
      return n === undefined ? [] : [{ ruleId: r.id, matchedNodes: n }];
    });
    return {
      textHash: derived.textHash,
      textExtractionVersion: derived.textExtractionVersion,
      current: {
        keptText: derived.text,
        removedText: derived.chrome.removedText,
        removedSegments: derived.chrome.removedSegments,
      },
      matches,
    };
  }

  /** SEEN's fold, once per call: each accepted ACQUIRED capture's removed side, as segments. */
  private async foldSeen(rows: readonly LoadedRow[]): Promise<void> {
    if (this.removedByAccepted !== null) return;
    const accepted = acceptedCaptures(this.decisions);
    const judged = rows.filter((r) => r.outcome === 'ACQUIRED' && accepted.has(r.waybackTimestamp));
    for (const capture of judged) await this.ensureExtracted(capture);
    this.removedByAccepted = new Map(
      judged.map((r) => [r.waybackTimestamp, segments(this.extractionOf(r).current.removedText)]),
    );
  }

  /** SEEN(page) for judging capture `t`: every accepted capture's removals but its own. */
  private seenExcluding(t: string): Set<string> {
    const folded = this.removedByAccepted ?? new Map<string, readonly string[]>();
    const captures: CaptureRemovals[] = [...folded]
      .filter(([capture]) => capture !== t)
      .map(([waybackTimestamp, removed]) => ({ waybackTimestamp, outcome: 'ACQUIRED', removed }));
    return seen(captures, this.decisions);
  }

  /** Gate 5's one paid call, built from the reused classifier's editorial answer (R-C). */
  private classify(t: string): Classify {
    return async (diff) => {
      this.agent ??= new ForensicAgent();
      const verdict = await this.agent.analyzeChange(diff.removed, diff.added, this.url, snapshotDateOf(t), []);
      return { editorial: verdict.editorial, reason: verdict.editorialReason };
    };
  }
}
