// ---------------------------------------------------------------------------
// ONE PRISMA DOUBLE FOR THE EVIDENCE LAYER'S SUITES — extracted from
// `test/debate.test.ts` at evidence step 14, never copied.
//
// WHY EXTRACTED RATHER THAN COPIED. Step 14's cases need the shape step 13's
// double already has — a page, its captures, its diffs, a thesis and its head
// mention, a session read back as it was written — and a second copy would be
// TWO DOUBLES FREE TO DISAGREE ABOUT WHAT THE DATABASE DOES: the same defect
// class as two spellings of a predicate, in the layer where it is hardest to
// see. `test/debate.test.ts`'s 49 cases import this and none of them changes;
// their staying GREEN is what proves the extraction.
//
// THE DEFAULTS ARE NAMED AND EXPORTED, BECAUSE `clearAllMocks` CLEARS CALLS AND
// NOT IMPLEMENTATIONS. A `mockImplementation` set inside one case stands for
// every later one — the cross-describe leak
// `docs/gf-legacy-switch-2026-09-08.md` §5 records this repository paying for
// once already, and `docs/gf-evidence-step-13-2026-09-09.md` §5 records it
// recurring. Both suites re-establish these in their own setup rather than
// trusting Jest.
//
// A MODULE SINGLETON, DELIBERATELY. Jest gives each test FILE its own module
// registry, so `store` and `db` are per-suite state despite being module-level
// here — and the `jest.mock` factory that hands `db` to the code under test
// reaches THIS instance through `require`, which is the only form that survives
// hoisting (the factory runs before an `import`ed binding is assigned).
// ---------------------------------------------------------------------------

import { PAGE, URL } from './corpusFixture';

export interface Row {
  [key: string]: unknown;
}

/** One write the code under test made, in order — what "ONE transaction" is checked against. */
export interface Write {
  model: string;
  op: string;
  data: Row;
}

/**
 * THE WRITE LOG AND THE WINDOWS, as CONST arrays mutated in place.
 *
 * Const rather than reassigned so a suite reads them through a live binding: a
 * `let` that `resetDouble` replaced would leave every importer holding the
 * previous array, which is a double that silently stops recording.
 */
export const written: Write[] = [];
export const windows: unknown[] = [];

/**
 * THE WRITES THAT WENT THROUGH A TRANSACTION'S OWN CLIENT, in order.
 *
 * `written` cannot tell "inside the transaction" from "beside it", because a
 * double that hands the SAME client to the callback makes `tx.evidence.update`
 * and `prisma.evidence.update` indistinguishable — and "ONE transaction" is the
 * central clause of §3b. `defaultTransaction` therefore hands the callback a
 * DISTINCT client whose writes land here as well, so a case can assert that both
 * rows were written through it.
 *
 * Entries are the SAME objects `written` holds: the wrapper calls the real
 * delegate, which records as it always did, and then copies what was appended.
 * `written`'s shape is untouched, which is what keeps `debate.test.ts`'s 49 cases
 * unedited.
 */
export const writtenViaTx: Write[] = [];

export const record = (model: string, op: string, data: Row): void => {
  written.push({ model, op, data });
};

/**
 * WHAT THE CODE UNDER TEST ASKED FOR, in order — every READ, with its arguments.
 *
 * `written` records what was written; nothing recorded what was ASKED, so a case
 * could only assert what the double answered. That is not the same question: a
 * `select` that loads a column it must not load, or a `where` the double ignores,
 * is invisible to an assertion about the answer. §7.1's "`chunks` is not selected
 * by `publishable`'s own query" is exactly that assertion, and it needs this.
 */
export interface Asked {
  model: string;
  op: string;
  args: unknown;
}
export const asked: Asked[] = [];

const ask = <A, R>(model: string, op: string, answer: (args: A) => R) => (args: A): R => {
  asked.push({ model, op, args });
  return answer(args);
};

/** Everything a suite may stand a query on. A field left null is a row that is not there. */
export const store = {
  thesis: null as Row | null,
  /**
   * Every thesis `audit-theses` may be asked about — `findMany` answers the ones
   * whose publication pin is set, because that is the `where` the instrument
   * sends. ADDED AT EVIDENCE STEP 15.
   */
  theses: [] as Row[],
  mention: null as Row | null,
  mentions: [] as Row[],
  version: null as Row | null,
  /** What `findUnique({ where: { id } })` answers — the session as it is read back. */
  session: null as Row | null,
  /** What `findUnique({ where: { openKey } })` answers — the OPEN one for the pair, or none. */
  openByKey: null as Row | null,
  evidence: null as Row | null,
  evidenceRows: [] as Row[],
  decisions: [] as Row[],
  textVersions: [] as Row[],
  /** The COMPUTED register, read in phase 2 only — one row per (diffId, hash). */
  contentVersions: [] as Row[],
  pageDecisions: [] as Row[],
  workList: null as Row | null,
  captures: [] as Row[],
  diffs: [] as Row[],
  /**
   * The stored anchor-time verdicts `storedAttributionFor` folds — subjectId,
   * verdict, detail, verifierVersion, checkedAt.
   *
   * ADDED AT EVIDENCE STEP 15, AND ITS ABSENCE WAS A TRAP. `integrityCheck.
   * findMany` answered `[]` unconditionally, so every capture read as
   * NEVER_CHECKED and `verified()` could never return `verified: true` — which
   * makes the "all six conjuncts PASS" case UNREACHABLE against the double
   * rather than failing. A conjunct stubbed to get past that would not be the
   * CALL §1d requires, so the double gains the rows instead.
   */
  integrityChecks: [] as Row[],
  /**
   * ARMED PER DELEGATE, never once for both. A case that arms the decision log's
   * race must not also arm the debate session's create: one flag for two writers
   * is a fixture that makes a case pass for the wrong reason.
   */
  collideOnCreate: null as Error | null,
  collideOnDecisionCreate: null as Error | null,
};

/**
 * The page every suite's fixtures sit on — IMPORTED from the corpus fixture, not
 * re-spelled. A second literal here would be a second answer to "which page is
 * this?", free to drift from the one the record names are computed against.
 */
export { PAGE, URL };

export const defaultSessionLookup = (args: {
  where: { id?: string; openKey?: string };
}): Promise<Row | null> => {
  if (args.where.openKey !== undefined) return Promise.resolve(store.openByKey);
  if (store.session === null) return Promise.resolve(null);
  // The read-back reflects what was just WRITTEN: a double whose events were
  // frozen would let `priorTurns` look right while the handler passed the
  // assessor the wrong turns.
  const base = (store.session['events'] ?? []) as Row[];
  const appended = written
    .filter((w) => w.model === 'diffDebateEvent')
    .map((w) => ({ type: w.data['type'], content: w.data['content'], createdAt: new Date() }));
  return Promise.resolve({ ...store.session, events: [...base, ...appended] });
};

/**
 * One delegate method, wrapped so the writes it makes are also recorded as having
 * gone THROUGH THE TRANSACTION.
 *
 * It calls the real mock, so call counts and `written` are exactly as before;
 * what it adds is the route. Copying what the underlying delegate appended —
 * rather than composing an entry here — is what makes `createMany`, which
 * records one entry per item, come out right without a second spelling of the
 * entry shape.
 */
function throughTransaction<A, R>(call: (args: A) => Promise<R>): (args: A) => Promise<R> {
  return async (args: A): Promise<R> => {
    const from = written.length;
    const out = await call(args);
    writtenViaTx.push(...written.slice(from));
    return out;
  };
}

/**
 * Every verb Prisma writes with — the property the wrapper below is stated as.
 *
 * A LIST OF DELEGATES WAS THE FIRST SHAPE AND IT WAS AN ENUMERATION STANDING FOR
 * A PROPERTY, the defect this repository has paid for under that name. The
 * equality form a case writes — `writtenViaTx` equals `written` — polices the
 * list, so nothing was ever wrong; what it could not police is a suite that
 * asserts LESS than equality about a delegate nobody remembered to wrap. Walking
 * `db`'s own delegates removes the thing to remember: today the two shapes wrap
 * exactly the same eight methods, and a delegate added at thesis step 20 is
 * wrapped without anyone editing this file.
 */
const WRITE_VERBS = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;

/**
 * The client a transaction's callback is handed — DISTINCT from `db` on purpose.
 *
 * Returned as an index signature rather than as `typeof db`: `defaultTransaction`
 * hands it to a callback typed `unknown`, so nothing needs the narrower type and
 * a cast to it would assert a shape this function does not check.
 */
function transactionClient(): Record<string, unknown> {
  const client: Record<string, unknown> = { ...db };
  for (const [model, delegate] of Object.entries(db)) {
    // `$transaction` is a function, not a delegate, and must never be wrapped.
    if (typeof delegate !== 'object' || delegate === null) continue;
    const wrapped: Record<string, unknown> = { ...(delegate as Record<string, unknown>) };
    for (const verb of WRITE_VERBS) {
      const method = wrapped[verb];
      if (typeof method === 'function') {
        wrapped[verb] = throughTransaction(method as (args: unknown) => Promise<unknown>);
      }
    }
    client[model] = wrapped;
  }
  return client;
}

export const defaultTransaction = async (fn: unknown, options?: unknown): Promise<unknown> => {
  windows.push(options);
  return typeof fn === 'function'
    ? (fn as (tx: unknown) => Promise<unknown>)(transactionClient())
    : undefined;
};

/**
 * The decisions of one record, IN THE ORDER THE CALLER ASKED FOR.
 *
 * A double that ignored `orderBy` would answer "the latest" whatever the caller
 * wrote, so a source that forgot `desc` would pass — and at §7.4 a wrong `last`
 * is a gap in the sequence or a collision, not a cosmetic error. The double
 * therefore obeys the argument and returns the list UNSORTED when none is given.
 */
function decisionsFor(fileHash: string, orderBy?: { sequence?: 'asc' | 'desc' }): Row[] {
  const forRecord = store.decisions.filter((d) => d['fileHash'] === fileHash);
  const direction = orderBy?.sequence;
  if (direction === undefined) return forRecord;
  return [...forRecord].sort((a, b) =>
    direction === 'desc'
      ? Number(b['sequence']) - Number(a['sequence'])
      : Number(a['sequence']) - Number(b['sequence']),
  );
}

export const db = {
  thesis: {
    findUnique: jest.fn(() => Promise.resolve(store.thesis)),
    // HONOURS `publishedVersionId: { not: null }` — the one question the
    // instrument asks. A double that returned every thesis would let a HEAD-only
    // citation be examined, and the non-firing control that holds the instrument
    // to PUBLISHED versions could not fire.
    findMany: jest.fn(
      ask('thesis', 'findMany', (args: { where?: { publishedVersionId?: { not?: null } } }) => {
        const pinnedOnly = args.where?.publishedVersionId !== undefined;
        return Promise.resolve(
          pinnedOnly ? store.theses.filter((t) => t['publishedVersionId'] != null) : store.theses,
        );
      }),
    ),
  },
  thesisVersion: { findUnique: jest.fn(() => Promise.resolve(store.version)) },
  thesisMention: {
    findFirst: jest.fn(() => Promise.resolve(store.mention)),
    // FILTERED ONLY WHEN THE CALLER NAMES A VERSION. `publishableEvidence` asks
    // `{ thesisVersionId, type }`; `evidenceReviews.citationsOf` asks by
    // `refId` and a version relation, and answers as it always did.
    findMany: jest.fn(
      ask('thesisMention', 'findMany', (args: { where?: { thesisVersionId?: string; type?: string } }) => {
        const version = args.where?.thesisVersionId;
        if (version === undefined) return Promise.resolve(store.mentions);
        return Promise.resolve(
          store.mentions.filter(
            (m) =>
              m['thesisVersionId'] === version &&
              (args.where?.type === undefined || m['type'] === args.where.type),
          ),
        );
      }),
    ),
    // BY ID, from the same list `findMany` answers with, so a version with two
    // mentions cannot silently grade one of them twice.
    //
    // THE FALLBACK IS SCOPED TO A SUITE THAT SET NO LIST. An unconditional
    // `?? store.mention` would answer a row for an id the store does not hold —
    // the ignored-`where` trap one level along, and it made "a mention that does
    // not exist" unwritable: the case resolved to a full report about a citation
    // the store never had. A suite that populates `mentions` gets a strict
    // lookup; one that uses the single-row fixture answers as it always did.
    findUnique: jest.fn(
      ask('thesisMention', 'findUnique', (args: { where?: { id?: string } }) => {
        if (store.mentions.length > 0) {
          return Promise.resolve(store.mentions.find((m) => m['id'] === args.where?.id) ?? null);
        }
        return Promise.resolve(store.mention);
      }),
    ),
    count: jest.fn(() => Promise.resolve(store.mentions.length)),
    update: jest.fn((args: { data: Row }) => {
      record('thesisMention', 'update', args.data);
      return Promise.resolve({});
    }),
  },
  trackedUrl: {
    findUnique: jest.fn(() => Promise.resolve(PAGE)),
    findMany: jest.fn(() => Promise.resolve([PAGE])),
  },
  urlSnapshot: {
    findMany: jest.fn(() => Promise.resolve(store.captures)),
    // BY ID, from the same list `findMany` answers with. A double that returned
    // one fixed row would let a case about two captures pass while the code read
    // the wrong one.
    findUnique: jest.fn((args: { where: { id?: string } }) =>
      Promise.resolve(store.captures.find((c) => c['id'] === args.where.id) ?? null),
    ),
  },
  urlVersionDiff: { findMany: jest.fn(() => Promise.resolve(store.diffs)) },
  diffContentVersion: {
    // HONOURS ITS `where`, so a case can assert that phase 2 asked for the two
    // versions the entry shows and no others.
    findMany: jest.fn((args: { where: { diffId?: string; contentVersionHash?: { in?: string[] } } }) => {
      const wanted = args.where.contentVersionHash?.in ?? null;
      return Promise.resolve(
        store.contentVersions.filter(
          (v) =>
            v['diffId'] === args.where.diffId &&
            (wanted === null || wanted.includes(String(v['contentVersionHash']))),
        ),
      );
    }),
  },
  cdxIndexEntry: { findFirst: jest.fn(() => Promise.resolve(store.workList)) },
  textVersion: {
    findFirst: jest.fn(() => Promise.resolve(store.textVersions.at(0) ?? null)),
    // The KEPT version of one capture, by the compound key the schema declares:
    // @@unique([snapshotId, textHash]).
    findUnique: jest.fn((args: { where: { snapshotId_textHash?: Row } }) => {
      const key = args.where.snapshotId_textHash ?? {};
      return Promise.resolve(
        store.textVersions.find(
          (v) => v['snapshotId'] === key['snapshotId'] && v['textHash'] === key['textHash'],
        ) ?? null,
      );
    }),
  },
  pageDecision: { findUnique: jest.fn(() => Promise.resolve(store.pageDecisions.at(0) ?? null)) },
  integrityCheck: {
    // NEWEST FIRST and filtered by subject, because that is what
    // `storedAttributionFor` asks: it folds "newest wins" over the answer, so a
    // double that returned them in insertion order would let a stale verdict
    // stand in for a current one and the fold would never be exercised.
    findMany: jest.fn(
      ask(
        'integrityCheck',
        'findMany',
        (args: { where?: { subjectId?: { in?: string[] }; subjectType?: string; checkType?: string } }) => {
          const wanted = args.where?.subjectId?.in ?? null;
          const rows = store.integrityChecks.filter(
            (c) =>
              (wanted === null || wanted.includes(String(c['subjectId']))) &&
              (args.where?.subjectType === undefined || c['subjectType'] === args.where.subjectType) &&
              (args.where?.checkType === undefined || c['checkType'] === args.where.checkType),
          );
          return Promise.resolve(
            [...rows].sort((a, b) => Number(b['checkedAt']) - Number(a['checkedAt'])),
          );
        },
      ),
    ),
  },
  evidence: {
    // HONOURS ITS `where`. It answered `store.evidence` whatever it was asked,
    // so the row `publishable` loads and the row `verified()` loads were the
    // same object however the case set them up — and a NO-EVIDENCE-ROW case
    // could not be written at all. The fallback keeps every suite written
    // against the single-row fixture green: a candidate with no `fileHash` of
    // its own answers as before, and one that HAS a name must match the name it
    // was asked for.
    findUnique: jest.fn(
      ask('evidence', 'findUnique', (args: { where?: { fileHash?: string } }) => {
        const wanted = args.where?.fileHash;
        const named = store.evidenceRows.find((r) => r['fileHash'] === wanted);
        if (named !== undefined) return Promise.resolve(named);
        const held = store.evidence;
        if (held === null) return Promise.resolve(null);
        const its = held['fileHash'];
        if (wanted !== undefined && its !== undefined && its !== wanted) return Promise.resolve(null);
        return Promise.resolve(held);
      }),
    ),
    // LIKEWISE, and it is a SEPARATE field from `store.evidence`: a case that
    // says "there is no row for this record" must not leave one reachable
    // through the other delegate, or check 17 answers from a row the case says
    // does not exist and `evidenceInputSoundness.ts:185-188`'s "absent from
    // rows" rule goes unexercised.
    findMany: jest.fn(
      ask('evidence', 'findMany', (args: { where?: { fileHash?: { in?: string[] } } }) => {
        const wanted = args.where?.fileHash?.in ?? null;
        return Promise.resolve(
          wanted === null
            ? store.evidenceRows
            : store.evidenceRows.filter((r) => wanted.includes(String(r['fileHash']))),
        );
      }),
    ),
    create: jest.fn((args: { data: Row }) => {
      record('evidence', 'create', args.data);
      return Promise.resolve({
        id: 'ev-1',
        status: args.data['status'],
        affirmedContentVersionHash: args.data['affirmedContentVersionHash'],
      });
    }),
    update: jest.fn((args: { where: Row; data: Row }) => {
      record('evidence', 'update', args.data);
      const row = store.evidence ?? {};
      const updated = { ...row, ...args.data };
      store.evidence = updated;
      return Promise.resolve(updated);
    }),
  },
  evidenceDecision: {
    findFirst: jest.fn(
      (args: { where: { fileHash: string }; orderBy?: { sequence?: 'asc' | 'desc' } }) =>
        Promise.resolve(decisionsFor(args.where.fileHash, args.orderBy).at(0) ?? null),
    ),
    findMany: jest.fn(() => Promise.resolve(store.decisions)),
    create: jest.fn((args: { data: Row }) => {
      if (store.collideOnDecisionCreate !== null) return Promise.reject(store.collideOnDecisionCreate);
      record('evidenceDecision', 'create', args.data);
      const created = { id: 'decision-1', ...args.data };
      store.decisions.push(created);
      return Promise.resolve(created);
    }),
  },
  diffDebateSession: {
    // TWO LOOKUPS, ONE DELEGATE: `openOrRevise` asks by `openKey` (is there an
    // OPEN debate for this pair?) and `loadDebate` asks by `id`. A double that
    // answered both the same way would make the open path and the read-back move
    // together, which is exactly what they must not do.
    findUnique: jest.fn(defaultSessionLookup),
    findMany: jest.fn(() => Promise.resolve([])),
    create: jest.fn((args: { data: Row }) => {
      if (store.collideOnCreate !== null) return Promise.reject(store.collideOnCreate);
      record('diffDebateSession', 'create', args.data);
      return Promise.resolve({ id: 'session-1' });
    }),
    update: jest.fn((args: { data: Row }) => {
      record('diffDebateSession', 'update', args.data);
      return Promise.resolve({});
    }),
  },
  diffDebateEvent: {
    create: jest.fn((args: { data: Row }) => {
      record('diffDebateEvent', 'create', args.data);
      return Promise.resolve({});
    }),
    createMany: jest.fn((args: { data: Row[] }) => {
      for (const d of args.data) record('diffDebateEvent', 'create', d);
      return Promise.resolve({ count: args.data.length });
    }),
  },
  $transaction: jest.fn(defaultTransaction),
};

/**
 * Empty the log and the store, and RE-ESTABLISH the named defaults.
 *
 * Called from each suite's `beforeEach`, after `clearAllMocks` — which clears
 * calls and not implementations, so an implementation a case installed would
 * otherwise stand for every case after it.
 */
export function resetDouble(): void {
  written.length = 0;
  writtenViaTx.length = 0;
  windows.length = 0;
  asked.length = 0;
  store.thesis = null;
  store.theses = [];
  store.mention = null;
  store.mentions = [];
  store.version = null;
  store.session = null;
  store.openByKey = null;
  store.evidence = null;
  store.evidenceRows = [];
  store.decisions = [];
  store.textVersions = [];
  store.contentVersions = [];
  store.pageDecisions = [];
  store.workList = null;
  store.captures = [];
  store.diffs = [];
  store.integrityChecks = [];
  store.collideOnCreate = null;
  store.collideOnDecisionCreate = null;
  db.diffDebateSession.findUnique.mockImplementation(defaultSessionLookup);
  db.$transaction.mockImplementation(defaultTransaction);
  db.trackedUrl.findUnique.mockReturnValue(Promise.resolve(PAGE));
}
