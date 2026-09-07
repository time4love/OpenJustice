import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { sha256Bytes, TEXT_EXTRACTION_VERSION } from '../../lib/captureDocument';
import {
  fetchCaptureBytes,
  isTransientFetchFailure,
  isTransientWaybackError,
  SNAPSHOT_MAX_RETRIES,
  WaybackFetchError,
} from '../../lib/archiveHttp';
import { segments } from '../../lib/claimSurvival';
import { CURRENT_CLASSIFIER_INPUT_VERSION } from '../../lib/classificationProvenance';
import { CLASSIFIER_VERSION, classifierPromptHash, SUMMARY_VERSION } from '../../lib/classifierVersion';
import type { deriveTextUnderRuleset } from '../../lib/chromeRulesetApply';
import type { CurrentExtraction } from '../../lib/extractionDrift';
import { asJsonColumn } from '../../lib/jsonColumn';
import { ChainUnavailableError, openWalkRegistryWindow, RegistryFrozenError, type RegistryWindow } from '../../services/anchorSnapshots';
import { ForensicAgent } from '../../services/ForensicAgent';
import { storeCapture } from '../../services/recordCapture';
import { recordDiff, type DiffClassification } from '../../services/recordDiff';
import {
  acceptedCaptures,
  inTimestampOrder,
  knownText,
  nextRow,
  predecessor,
  resolved,
  rulesInForce,
  rulesetIdAt,
  seen,
  successor,
  supersedingDecision,
  type CaptureRemovals,
  type Decision,
  type Rule,
} from '../derivations';
import { evaluateCapture, type Derived, type Matched } from '../evaluate';
import { classifierDiffOf, type Classify, type ClassifierDiff } from '../gates';
import { markingUrl } from '../markingUrl';
import { WRITE_TRANSACTION } from '../pageLog';
import { answer, refusal, shared, type Refusal, type RefusalCode } from '../refusals';
import { loadWorkListRows, snapshotDateOf, type LoadedRow } from '../rows';
import { pendingStopOf, type Stop, type StopGate } from '../stop';

// ---------------------------------------------------------------------------
// scan_captures({ url, maxCaptures }) — docs/gf-interaction-flows.md A5, Phase 2
// and Flow 3: THE WALK, WRITING (refactor step 5). Every decision of the
// reporting form is now a write: the digest shortcut, the fetch, the derivation,
// the comparison, all five gates through `evaluateCapture`, and then the
// outcome on the work-list row — and on ACQUIRED the capture stored and
// anchored, its diff written with its verdict.
//
// ONE TRANSACTION PER CAPTURE, and the order around it (ruled 2026-09-06):
// the store with its AWAITED anchor, then the diff, then the row — each outside
// the transaction and before the row becomes ACQUIRED, so a halt leaves a row
// that says less than the corpus holds, never more. The transaction holds the
// row's update, the capture's RuleMatch rows (Q6: on every capture the walk
// derived, stops included, one bulk call) and, on a supersession, the
// TextVersion beside the snapshot's new text (I3: this is the one module that
// does both). `WRITE_TRANSACTION` on it, as every write tool (A8).
//
// ACQUISITION IS ATOMIC PER CAPTURE: IT COMPLETES, OR HALTS HAVING CHANGED ONLY
// THE ROW. The anchor is awaited as the capture is stored (Phase 2, ruled
// 2026-09-02); a chain that cannot be reached, read or written halts the call
// with CHAIN_UNAVAILABLE (Q8), a registry that is neither empty nor scheme-
// stamped with REGISTRY_FROZEN (evidence §8) — both returned like
// ARCHIVE_UNAVAILABLE, everything before the halted row kept, the row itself
// untouched. A snapshot the store wrote before the anchor failed stays: the
// next call reaches the same row, and the store's existing-row path retries
// the anchor on the bytes held. WRITES_ALLOWED is the window's, asked by the
// store before the first row it creates and memoised for the call (A5,
// "evaluated once per call before the first anchor").
//
// A STOP HOLDS THE CAPTURE ON ITS ROW: PENDING_JUDGEMENT, `stop` = { gates },
// the bytes as `heldBody` on a fresh fetch. A stop on a STORED capture (Q7,
// the re-walk's Gate 1') keeps its snapshotId and holds no body; the marking
// page reads the snapshot for it, and the retry re-derives from it.
//
// THE WALK'S WORKING STATE IS AN IN-MEMORY VIEW OF THE PAGE'S ROWS, kept in
// step with every write, so a later row in the chunk sees an earlier row's
// outcome exactly as the next call will — the IDENTICAL shortcut against a row
// this call just judged, the predecessor a row this call just acquired.
//
// THE PREDECESSOR IS RE-DERIVED from its snapshot's document under
// RULES_IN_FORCE at ITS timestamp (Q4, 2026-09-05): one derivation supplies its
// kept and removed sides AND its match counts, keyed to the rule; a rule whose
// selector the parser rejected has no count, and Gate 2 throws on the absence.
// `deriveTextUnderRuleset` is ESM-only through jsdom and is loaded by dynamic
// import once per call, never at module load (§8).
//
// SEEN IS FOLDED ONCE PER CALL (ruled 2026-09-05): the removed sides of the
// ACQUIRED captures a human has ACCEPTED, split by `segments` — the gates'
// splitter — into one map; each row is judged against the union of every
// capture but ITSELF.
//
// SPEND: EXACTLY ONE PAID CALL PER ACQUIRED NOVEL CAPTURE. Gate 5's verdict,
// when the gate ran, IS the diff's classification; when a RESOLVED capture
// skipped the gates, the classifier is asked once at acquisition (A4: "a
// RESOLVED row skips all five gates — and NOT the classifier"). One memoised
// classifier per capture makes that a property rather than a convention. The
// classifier is handed no correlated evidence (R-C): the editorial question is
// answered from the text alone.
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

/** A5's six counts, zero-filled. */
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

/**
 * A halted walk: the refusal, the row it halted at, and what was done before
 * it — ARCHIVE_UNAVAILABLE (A5), REGISTRY_FROZEN (evidence §8) and
 * CHAIN_UNAVAILABLE (Q8) share the one shape.
 */
interface HaltedWalk extends Refusal {
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

/** A stored capture's text, as the snapshot holds it — what a supersession keeps. */
interface StoredText {
  snapshotId: string;
  text: string;
  textHash: string;
  textExtractionVersion: string;
}

/** What `prepare` loads before a capture is evaluated: its bytes, its stored text if any, its own approved text, its predecessor. */
interface Prepared {
  bytes: Bytes;
  /** Set when the capture is already a UrlSnapshot — an ACQUIRED row, or a PENDING one on a stored capture (Q7). */
  stored: StoredText | null;
  approvedText: { keptText: string } | null;
  predecessor: LoadedRow | null;
}

/**
 * What the walk writes onto a work-list row, in the row's own vocabulary; one
 * mapping turns it into the update, so the in-memory view and the database
 * receive the same change.
 */
type RowChange = Partial<
  Pick<
    LoadedRow,
    | 'outcome'
    | 'comparedTo'
    | 'rulesetId'
    | 'textHash'
    | 'textExtractionVersion'
    | 'fetchedAt'
    | 'rawBytesHash'
    | 'digestVerified'
    | 'contentType'
    | 'contentEncoding'
    | 'heldBody'
    | 'snapshotId'
  >
> & { stop?: Stop | null };

/** The supersession of a stored capture's text: what is kept, and what replaces it. */
interface Supersession {
  previous: StoredText;
  rulesetId: string;
  next: { text: string; textHash: string; textExtractionVersion: string };
  decisionId: string | null;
  /** When the superseded text became current — the row's last write, read from the row. */
  derivedAt: Date;
}

/** One side of a diff as the walk hands it to the writer: the stored capture and the text the corpus holds for it. */
interface DiffSide {
  snapshotId: string;
  waybackTimestamp: string;
  text: string;
  textHash: string;
}

/** A diff a supersession owes: re-derived against the new text, written inside the capture's transaction (step 7). */
interface Rederived {
  before: DiffSide;
  after: DiffSide;
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

/**
 * UNSERVABLE on a refusal the archive will repeat; UNAVAILABLE on one it may
 * not; null when the error is not the archive's. Both shapes the reused fetch
 * throws are read — the wrapped WaybackFetchError, and the transport's own
 * error for a timeout, a reset or a DNS failure — through the one status rule.
 */
function fetchFailure(err: unknown): 'UNSERVABLE' | 'UNAVAILABLE' | null {
  if (err instanceof WaybackFetchError) return isTransientFetchFailure(err) ? 'UNAVAILABLE' : 'UNSERVABLE';
  return isTransientWaybackError(err) ? 'UNAVAILABLE' : null;
}

/**
 * The row's update, from the walk's change. `outcome` is the column `status`;
 * `stop` is a Json column, so its cleared state is SQL NULL (Prisma.DbNull,
 * never JsonNull — the state A2 calls "cleared") and its written state crosses
 * the JSON boundary explicitly, a gate's material being opaque here.
 */
function rowData(change: RowChange): Prisma.CdxIndexEntryUncheckedUpdateInput {
  const { outcome, stop, ...columns } = change;
  const data: Prisma.CdxIndexEntryUncheckedUpdateInput = { ...columns };
  if (outcome !== undefined) data.status = outcome;
  if (stop !== undefined) data.stop = stop === null ? Prisma.DbNull : asJsonColumn(stop);
  return data;
}

export async function scanCapturesHandler(input: ScanInput): Promise<string> {
  return answer(async (): Promise<ScanResult | HaltedWalk | Refusal> => {
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
    // Pending means unanswered: a PENDING row with a stop AND a decision under
    // the ruleset now in force is RESOLVED — the researcher marked and approved
    // — and the walk acquires it (Phase 2, "recovery is the retry").
    for (const row of inTimestampOrder(stored)) {
      const pending = pendingStopOf(row);
      if (pending !== null && !resolved(row, rules, decisions)) {
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
    return new PageWalk(page.id, input.url, stored, rules, decisions, deriveTextUnderRuleset, openWalkRegistryWindow()).run(
      input.maxCaptures,
    );
  });
}

class PageWalk {
  private readonly view: Map<string, LoadedRow>;
  private readonly extractions = new Map<string, Extraction>();
  private removedByAccepted: Map<string, readonly string[]> | null = null;
  /** The captures a human ACCEPTED under AUTHORITY, folded once: SEEN's captures, and the rows that have approved text. */
  private readonly accepted: Set<string>;
  private agent: ForensicAgent | null = null;
  /** The classifier's draws this call, one per pair — see `draw`. */
  private readonly draws = new Map<string, Promise<DiffClassification>>();
  private readonly outcomes = zeroOutcomes();
  private walked = 0;

  constructor(
    private readonly trackedUrlId: string,
    private readonly url: string,
    stored: readonly LoadedRow[],
    private readonly rules: readonly Rule[],
    private readonly decisions: readonly Decision[],
    private readonly derive: Derive,
    private readonly window: RegistryWindow,
  ) {
    this.view = new Map(stored.map((row) => [row.waybackTimestamp, { ...row }]));
    this.accepted = acceptedCaptures(decisions);
  }

  private rows(): LoadedRow[] {
    return inTimestampOrder([...this.view.values()]);
  }

  async run(maxCaptures: number): Promise<ScanResult | HaltedWalk> {
    while (this.walked < maxCaptures) {
      const row = nextRow(this.rows(), this.rules, this.decisions, TEXT_EXTRACTION_VERSION);
      if (row === null) break;
      const halted = await this.step(row);
      if (halted !== null) return halted;
    }
    const next = nextRow(this.rows(), this.rules, this.decisions, TEXT_EXTRACTION_VERSION);
    return { walked: this.walked, outcomes: this.outcomes, stop: null, next: next?.waybackTimestamp ?? null };
  }

  /** The call ends at this row: the refusal, and what was done before it — the row itself untouched. */
  private halt(code: RefusalCode, capture: string, error: string): HaltedWalk {
    return { ...refusal(code, error), capture, walked: this.walked, outcomes: this.outcomes, next: capture };
  }

  /**
   * THE ONE TRANSACTION PER CAPTURE: the row, its RuleMatch rows, and on a
   * supersession the TextVersion beside the snapshot's new text. Writes go
   * through `tx`; the in-memory view moves with the commit.
   */
  private async write(
    row: LoadedRow,
    change: RowChange,
    matches: readonly Matched[],
    supersession: Supersession | null,
    rederive: readonly Rederived[] = [],
  ): Promise<void> {
    const t = row.waybackTimestamp;
    await prisma.$transaction(async (tx) => {
      await tx.cdxIndexEntry.update({ where: { id: row.id }, data: rowData(change) });
      if (matches.length > 0) {
        // Q6: the durable record of what each rule matched on this capture —
        // same bytes under the same selector, the same count, so a re-derivation
        // is a duplicate and not a second observation.
        await tx.ruleMatch.createMany({
          data: matches.map((m) => ({ ruleId: m.ruleId, waybackTimestamp: t, matchedNodes: m.matchedNodes })),
          skipDuplicates: true,
        });
      }
      if (supersession !== null) {
        // I3: the previous text is KEPT as a version, then the snapshot's text
        // moves — one transaction, and this module is the only one that does both.
        await tx.textVersion.create({
          data: {
            snapshotId: supersession.previous.snapshotId,
            text: supersession.previous.text,
            textHash: supersession.previous.textHash,
            textExtractionVersion: supersession.previous.textExtractionVersion,
            rulesetId: supersession.rulesetId,
            derivedAt: supersession.derivedAt,
            supersededByDecisionId: supersession.decisionId,
          },
        });
        await tx.urlSnapshot.update({
          where: { id: supersession.previous.snapshotId },
          data: {
            text: supersession.next.text,
            textHash: supersession.next.textHash,
            textExtractionVersion: supersession.next.textExtractionVersion,
          },
        });
        // STEP 7: every diff spanning the superseded text gains a content
        // version cut from the NEW text, the old kept (evidence flows §3) — in
        // this transaction, after the text moved, so the writer's guard reads
        // the text the version is cut from. Their classifications were drawn
        // before the transaction opened; nothing paid runs inside it.
        for (const diff of rederive) await this.writeDiff(tx, diff.before, diff.after);
      }
    }, WRITE_TRANSACTION);
    // The view moves with the commit. A WRITTEN stop is not kept on it — the
    // call ends at a stop, so nothing reads it back; a CLEARED one is.
    const { stop, ...columns } = change;
    this.view.set(t, { ...row, ...columns, ...(stop === null ? { stop: null } : {}) });
  }

  /** One capture: the shortcut, the bytes, the gates, the outcome written. Returns what ends the call, or null to go on. */
  private async step(row: LoadedRow): Promise<ScanResult | HaltedWalk | null> {
    const rows = this.rows();
    const t = row.waybackTimestamp;

    // The IDENTICAL shortcut: same digest as the preceding row, whose text is
    // KNOWN — nothing fetched, nothing derived. OFF for the page while any row
    // carries digestVerified = false. Only a row we hold no bytes for takes it.
    if (row.outcome === 'UNFETCHED' && !rows.some((r) => r.digestVerified === false)) {
      const index = rows.findIndex((r) => r.waybackTimestamp === t);
      const preceding = index > 0 ? rows.at(index - 1) : undefined;
      if (preceding?.digest === row.digest && knownText(preceding)) {
        await this.write(row, { outcome: 'IDENTICAL', comparedTo: preceding.waybackTimestamp }, [], null);
        this.outcomes.identical += 1;
        this.walked += 1;
        return null;
      }
    }

    const prepared = await this.prepare(row, rows);
    if (prepared === 'UNSERVABLE') {
      await this.write(row, { outcome: 'UNSERVABLE', fetchedAt: new Date() }, [], null);
      this.outcomes.unservable += 1;
      this.walked += 1;
      return null;
    }
    if (prepared === 'UNAVAILABLE') {
      return this.halt(
        'ARCHIVE_UNAVAILABLE',
        t,
        `The archive did not serve capture ${t}; the row stays UNFETCHED and the walk stops here. Everything before it is kept.`,
      );
    }
    const { bytes, stored, approvedText, predecessor: pred } = prepared;
    const before = pred === null ? null : this.extractionOf(pred);

    // ONE derivation of this capture per step, parsed on first need — by
    // `derive`, by the `novel` getter, or by the outcome.
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
    // Gate 5's draw is the acquisition's: one paid call per acquired novel
    // capture, keyed by the pair it judges.
    const classify = this.classifyFor(pred?.waybackTimestamp ?? null, t);

    // The one composition of the gates (A4): the DIGEST check first, on a fresh
    // fetch; then RESOLVED — a human just ruled on this capture under the
    // ruleset now in force, so the five gates are skipped there, and not the
    // classifier, which the acquisition below asks. The walk keeps no second
    // copy of that skip: a RESOLVED capture fetched fresh still has its bytes
    // compared with the index (amended 2026-09-06, the final review).
    const stop = await evaluateCapture({
      t,
      rules: this.rules,
      decisions: this.decisions,
      row,
      predecessor: pred?.waybackTimestamp ?? null,
      fetched: bytes.fresh ? { bytes: bytes.bytes, expectedDigest: row.digest } : null,
      derive: deriveOnce,
      // A getter, because the contract fixes `novel: boolean` and Gate 5 is
      // the only reader: it parses on first read, so a Gate 0 or RESOLVED
      // answer derives nothing.
      get novel() {
        return novel();
      },
      classify,
    });

    // What a fresh fetch observed, written with whatever outcome follows (A2).
    // digestVerified is the DIGEST check's answer — the one place sha1(bytes)
    // is compared with the index — and the check runs on every fresh fetch, so
    // the column is written on exactly those.
    const digestVerified = bytes.fresh ? stop?.gates.at(0)?.gate !== 'DIGEST' : row.digestVerified;
    const fetchFacts: RowChange = bytes.fresh
      ? {
          fetchedAt: new Date(),
          rawBytesHash: sha256Bytes(bytes.bytes),
          digestVerified,
          contentType: bytes.contentType,
          contentEncoding: bytes.contentEncoding,
        }
      : {};
    // RuleMatch rows for every capture this call derived — a stop included;
    // a Gate 0, DIGEST or RESOLVED answer derived nothing and writes none.
    const matches = (): readonly Matched[] => mine?.matches ?? [];

    if (stop !== null) {
      // The capture is HELD on its row: the bytes on a fresh fetch, nothing
      // twice on a stored capture (Q7) or a re-evaluated held one.
      await this.write(
        row,
        { ...fetchFacts, outcome: 'PENDING_JUDGEMENT', stop: { gates: stop.gates }, ...(bytes.fresh ? { heldBody: bytes.bytes } : {}) },
        matches(),
        null,
      );
      this.walked += 1;
      return {
        walked: this.walked,
        outcomes: this.outcomes,
        stop: { ...stop, markingUrl: markingUrl(this.trackedUrlId, t) },
        next: t,
      };
    }

    // Quiet, or RESOLVED: the outcome.
    const stamp: RowChange = {
      ...fetchFacts,
      rulesetId: rulesetIdAt(this.rules, this.decisions, t),
      textHash: extraction().textHash,
      textExtractionVersion: extraction().textExtractionVersion,
    };

    if (stored !== null) {
      // Flow 3: a stored capture re-derived. Its snapshot and anchor STAY; the
      // text moves only by a versioned supersession, or not at all (restamped).
      const changed = extraction().textHash !== stored.textHash;
      const previousRulesetId = this.requireStamp(row, 'rulesetId');
      // Q4: the version names the newest decision after which the ruleset at
      // this date changed — and NULL when the rules had no part in the
      // supersession, i.e. the ruleset the previous text was derived under IS
      // the one in force now, and only the extractor moved. Asked here, from
      // the two stamps, because the replay alone always finds a decision once
      // any rule exists (found live 2026-09-07 on the first re-walk after v3).
      const supersession: Supersession | null = changed
        ? {
            previous: stored,
            rulesetId: previousRulesetId,
            next: {
              text: extraction().current.keptText,
              textHash: extraction().textHash,
              textExtractionVersion: extraction().textExtractionVersion,
            },
            decisionId:
              previousRulesetId === stamp.rulesetId ? null : (supersedingDecision(this.rules, this.decisions, t)?.id ?? null),
            derivedAt: row.updatedAt,
          }
        : null;
      // STEP 7: the diffs the new text spans — with the predecessor and with the
      // successor — re-derived as new content versions. Their paid draws happen
      // HERE, before the transaction; the versions are written inside it.
      const rederive: Rederived[] = [];
      if (changed) {
        const renewed = this.sideOf(stored.snapshotId, t, extraction());
        if (pred !== null && before !== null) rederive.push({ before: this.sideOfExtraction(pred, before), after: renewed });
        const next = successor(rows, row);
        if (next !== null) rederive.push({ before: renewed, after: await this.storedSide(next) });
        await Promise.all(rederive.map((d) => this.opinion(d.before, d.after)));
      }
      await this.write(row, { ...stamp, outcome: 'ACQUIRED', heldBody: null, stop: null }, matches(), supersession, rederive);
      this.extractions.set(t, extraction());
      this.outcomes[changed ? 'superseded' : 'restamped'] += 1;
      this.walked += 1;
      return null;
    }

    if (!novel()) {
      await this.write(
        row,
        { ...stamp, outcome: 'DUPLICATE', comparedTo: pred?.waybackTimestamp ?? null, heldBody: null, stop: null },
        matches(),
        null,
      );
      this.outcomes.duplicate += 1;
      this.walked += 1;
      return null;
    }

    // NOVEL, quiet or RESOLVED: store and anchor, then the diff, then the row.
    let snapshotId: string;
    try {
      ({ snapshotId } = await storeCapture({
        trackedUrlId: this.trackedUrlId,
        url: this.url,
        waybackTimestamp: t,
        document: bytes.bytes,
        contentType: bytes.contentType,
        contentEncoding: bytes.contentEncoding,
        derived: {
          text: extraction().current.keptText,
          textHash: extraction().textHash,
          textExtractionVersion: extraction().textExtractionVersion,
        },
        window: this.window,
      }));
    } catch (err) {
      if (err instanceof RegistryFrozenError) return this.halt('REGISTRY_FROZEN', t, `${err.message} The walk stops at capture ${t}; everything before it is kept.`);
      if (err instanceof ChainUnavailableError) return this.halt('CHAIN_UNAVAILABLE', t, `${err.message} The walk stops at capture ${t}; everything before it is kept.`);
      throw err;
    }

    const acquiredSide = this.sideOf(snapshotId, t, extraction());
    if (pred !== null && before !== null) {
      // The diff against the predecessor, with the verdict: Gate 5's when it
      // ran, one classification at acquisition when RESOLVED skipped the gates.
      await this.writeDiff(null, this.sideOfExtraction(pred, before), acquiredSide);
    }
    // A5's clause owed by evidence flows §7: a capture acquired BETWEEN two
    // ACQUIRED captures — a re-walk turning a DUPLICATE novel, or a capture the
    // index gained with an old date — re-diffs its successor against it, so the
    // timeline stays a consecutive chain; the old pair's row stays.
    const next = successor(rows, row);
    if (next !== null) await this.writeDiff(null, acquiredSide, await this.storedSide(next));

    await this.write(
      row,
      { ...stamp, outcome: 'ACQUIRED', comparedTo: pred?.waybackTimestamp ?? null, snapshotId, heldBody: null, stop: null },
      matches(),
      null,
    );
    this.extractions.set(t, extraction());
    this.outcomes.acquired += 1;
    this.walked += 1;
    return null;
  }

  /** A stamp a derived row must carry; a null is a row derived under something it cannot name — a walk defect. */
  private requireStamp(row: LoadedRow, column: 'rulesetId' | 'snapshotId'): string {
    const value = row[column];
    if (value === null) throw new Error(`Walk defect: capture ${row.waybackTimestamp} is ${row.outcome} and carries no ${column}.`);
    return value;
  }

  /**
   * The reads a capture needs before it is judged, done once: its bytes (held
   * on a PENDING row, the snapshot's document on a stored capture, else a
   * fresh raw fetch), its own approved text when it has one, and its
   * predecessor, loaded and derived so `derive` can be synchronous. Reads only —
   * the walk spends nothing before the gates.
   *
   * APPROVED TEXT IS TEXT A HUMAN ACCEPTED (A4 amended 2026-09-05): the
   * snapshot's text is handed over only for a stored capture with a
   * CAPTURE_ACCEPTED under AUTHORITY. A row acquired quietly, or the legacy
   * corpus derived under no rules, has none, and Gate 1' is not asked of it.
   */
  private async prepare(row: LoadedRow, rows: readonly LoadedRow[]): Promise<Prepared | 'UNSERVABLE' | 'UNAVAILABLE'> {
    const pred = predecessor(rows, row);
    if (pred !== null) await this.ensureExtracted(pred);
    await this.foldSeen(rows);

    if (row.outcome === 'PENDING_JUDGEMENT' && row.heldBody !== null) {
      return {
        bytes: {
          bytes: Buffer.from(row.heldBody),
          contentType: row.contentType,
          contentEncoding: row.contentEncoding,
          fresh: false,
        },
        stored: null,
        approvedText: null,
        predecessor: pred,
      };
    }
    if (row.outcome === 'ACQUIRED' || (row.outcome === 'PENDING_JUDGEMENT' && row.snapshotId !== null)) {
      const snapshot = await this.snapshotOf(row);
      return {
        bytes: {
          bytes: snapshot.document,
          contentType: snapshot.documentContentType,
          contentEncoding: snapshot.documentContentEncoding,
          fresh: false,
        },
        stored: {
          snapshotId: snapshot.id,
          text: snapshot.text,
          textHash: snapshot.textHash,
          textExtractionVersion: snapshot.textExtractionVersion,
        },
        approvedText: this.accepted.has(row.waybackTimestamp) ? { keptText: snapshot.text } : null,
        predecessor: pred,
      };
    }
    try {
      const fetched = await fetchCaptureBytes(this.url, row.waybackTimestamp, { maxRetries: SNAPSHOT_MAX_RETRIES });
      return { bytes: { ...fetched, fresh: true }, stored: null, approvedText: null, predecessor: pred };
    } catch (err) {
      const failure = fetchFailure(err);
      if (failure === null) throw err;
      return failure;
    }
  }

  private async snapshotOf(row: LoadedRow): Promise<{
    id: string;
    document: Buffer;
    documentContentType: string | null;
    documentContentEncoding: string | null;
    text: string;
    textHash: string;
    textExtractionVersion: string;
  }> {
    if (row.snapshotId === null) {
      throw new Error(`Walk defect: capture ${row.waybackTimestamp} is ${row.outcome} and names no snapshot.`);
    }
    const snapshot = await prisma.urlSnapshot.findUnique({
      where: { id: row.snapshotId },
      select: {
        id: true,
        document: true,
        documentContentType: true,
        documentContentEncoding: true,
        text: true,
        textHash: true,
        textExtractionVersion: true,
      },
    });
    if (snapshot === null) {
      throw new Error(
        `Walk defect: capture ${row.waybackTimestamp} names snapshot ${row.snapshotId}, which does not exist.`,
      );
    }
    return { ...snapshot, document: Buffer.from(snapshot.document) };
  }

  /**
   * A stored ACQUIRED capture's extraction, loaded and derived once per call.
   *
   * ITS KEPT SIDE IS THE TEXT THE CORPUS HOLDS — the snapshot's `text` and
   * `textHash`, what a human stood behind, what novelty is keyed on and what a
   * diff is cut from (evidence A2: a version is named by its stored hashes).
   * The re-derivation under RULES_IN_FORCE at its timestamp supplies what the
   * corpus does not store: the removed side and the match counts the gates
   * need. The walk's order — a stale row is NEXT_ROW before any successor —
   * is what keeps the two in agreement.
   */
  private async ensureExtracted(row: LoadedRow): Promise<void> {
    if (this.extractions.has(row.waybackTimestamp)) return;
    const snapshot = await this.snapshotOf(row);
    const derived = this.extract(row.waybackTimestamp, {
      bytes: snapshot.document,
      contentType: snapshot.documentContentType,
      contentEncoding: snapshot.documentContentEncoding,
      fresh: false,
    });
    this.extractions.set(row.waybackTimestamp, {
      ...derived,
      textHash: snapshot.textHash,
      textExtractionVersion: snapshot.textExtractionVersion,
      current: { ...derived.current, keptText: snapshot.text },
    });
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
    const judged = rows.filter((r) => r.outcome === 'ACQUIRED' && this.accepted.has(r.waybackTimestamp));
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

  /**
   * THE ONE PAID CALL PER PAIR, memoised for the call. Gate 5 asks through
   * `classifyFor` and reads the editorial answer (R-C); the acquisition asks
   * through `opinion` for the same pair and stores the whole output with its
   * provenance — whichever asks first pays, the other reads the same draw. A
   * supersession's re-derived diffs are other pairs, each one draw (evidence
   * flows §3: the price of a better derivation, paid once per record).
   */
  private draw(beforeTs: string | null, afterTs: string, diffOf: () => ClassifierDiff): Promise<DiffClassification> {
    const key = `${beforeTs ?? ''}→${afterTs}`;
    let drawn = this.draws.get(key);
    if (drawn === undefined) {
      drawn = (async (): Promise<DiffClassification> => {
        this.agent ??= new ForensicAgent();
        // A `ClassifierDiff`, built in ONE place (`classifierDiffOf`) from the
        // shared selection rule — which test/classifierInputRule.test.ts reads
        // off this very call.
        const diff = diffOf();
        const verdict = await this.agent.analyzeChange(diff.removed, diff.added, this.url, snapshotDateOf(afterTs), []);
        return {
          ...verdict,
          classifierVersion: CLASSIFIER_VERSION,
          // What the model READ: `classifierDiffOf` cuts under the current
          // input rule, and the stamp says so beside the classifier's version.
          classifiedInputVersion: CURRENT_CLASSIFIER_INPUT_VERSION,
          classifierModel: this.agent.modelId,
          classifierPromptHash: classifierPromptHash(),
          summaryVersion: SUMMARY_VERSION,
        };
      })();
      this.draws.set(key, drawn);
    }
    return drawn;
  }

  /** Gate 5's view of the pair's draw: the editorial answer, nothing else (R-C). */
  private classifyFor(beforeTs: string | null, afterTs: string): Classify {
    return async (diff) => {
      const verdict = await this.draw(beforeTs, afterTs, () => diff);
      return { editorial: verdict.editorial, reason: verdict.editorialReason };
    };
  }

  /** The pair's whole opinion, from the two texts the corpus holds for it. */
  private opinion(before: DiffSide, after: DiffSide): Promise<DiffClassification> {
    return this.draw(before.waybackTimestamp, after.waybackTimestamp, () => classifierDiffOf(before.text, after.text));
  }

  /**
   * THE ONE SITE THAT WRITES A DIFF (test/walk/diffOneSite.test.ts): the pair
   * and its content version, with the pair's opinion. `tx` is the capture's
   * transaction when the write belongs inside it (a supersession's
   * re-derivation), null for the acquisition's own, which the writer wraps.
   */
  private async writeDiff(tx: Prisma.TransactionClient | null, before: DiffSide, after: DiffSide): Promise<void> {
    const opinion = await this.opinion(before, after);
    await recordDiff(
      {
        trackedUrlId: this.trackedUrlId,
        beforeSnapshotId: before.snapshotId,
        afterSnapshotId: after.snapshotId,
        before: { waybackTimestamp: before.waybackTimestamp, text: before.text, textHash: before.textHash },
        after: { waybackTimestamp: after.waybackTimestamp, text: after.text, textHash: after.textHash },
        ...opinion,
      },
      tx ?? undefined,
    );
  }

  /** A capture as one side of a diff, from the extraction this call derived for it. */
  private sideOf(snapshotId: string, t: string, extraction: Extraction): DiffSide {
    return { snapshotId, waybackTimestamp: t, text: extraction.current.keptText, textHash: extraction.textHash };
  }

  /** A stored ACQUIRED row as one side of a diff, from the extraction already loaded for it. */
  private sideOfExtraction(row: LoadedRow, extraction: Extraction): DiffSide {
    return this.sideOf(this.requireStamp(row, 'snapshotId'), row.waybackTimestamp, extraction);
  }

  /** A stored ACQUIRED row as one side of a diff, from the text its snapshot holds. */
  private async storedSide(row: LoadedRow): Promise<DiffSide> {
    const snapshot = await this.snapshotOf(row);
    return { snapshotId: snapshot.id, waybackTimestamp: row.waybackTimestamp, text: snapshot.text, textHash: snapshot.textHash };
  }
}
