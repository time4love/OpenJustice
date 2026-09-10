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

/**
 * THE WRITES A REJECTED TRANSACTION TOOK BACK — thesis step 17, additive (7.3).
 *
 * A database rolls a transaction back WHOLE when its callback rejects, and the
 * STORE does so in `defaultTransaction`. `written` is deliberately NOT rewritten:
 * it is the log of every write the code ATTEMPTED, and a consumer reads it to see
 * what ran before a collision — `test/reviewEvidence.test.ts`'s race asserts "the
 * update never ran" from it, and erasing the entries would blind that assertion.
 * What a rollback took back is named HERE instead, by the same objects `written`
 * holds, so "nothing was committed" is `written` minus these, by identity. Q1's
 * STALE_PIN is decided inside the version write's transaction (the researcher's
 * ruling), where a write may precede the refusal; this is how its "nothing
 * written" is read without constraining which comes first.
 */
export const rolledBack: Write[] = [];

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
  /**
   * THE THESIS LAYER'S ROWS — added at thesis step 17, ADDITIVELY, for the
   * thesis acceptance suite (handoffs/R40-chunk-1-sketch.md §6-6). One double for
   * both layers, as step 14 ruled: a second would be two doubles free to
   * disagree about what the database does. No evidence suite reads these, and
   * each delegate below is appended to `db`, so `transactionClient` wraps it
   * without an edit — the property that function is stated as.
   */
  versions: [] as Row[],
  framings: [] as Row[],
  framingRounds: [] as Row[],
  analyses: [] as Row[],
  gapDecisions: [] as Row[],
  attempts: [] as Row[],
  withdrawals: [] as Row[],
  notes: [] as Row[],
  /**
   * The debates a `findMany` may answer — thesis step 17, additive (7.2 round 3):
   * HISTORY lists "arguments (debates)" among the rows naming a thesis (thesis
   * A3 :1407, §9 :974–:976). Empty by default, so the delegate answers `[]` to
   * every suite that sets nothing, exactly as it did.
   */
  debates: [] as Row[],
  /**
   * The ClaimTrajectory rows `claimTrajectory.findMany` answers — thesis step 17,
   * additive (7.3): a `#tr_` token names one, and UNKNOWN_TRAJECTORY_ID is a token
   * naming none (thesis A1 :1244, A4 :1473). Empty by default, so a suite that seeds
   * nothing is answered `[]`.
   */
  trajectories: [] as Row[],
};

type ThesisRowsKey =
  | 'versions'
  | 'framings'
  | 'framingRounds'
  | 'analyses'
  | 'gapDecisions'
  | 'attempts'
  | 'withdrawals'
  | 'notes';

/**
 * An APPEND-ONLY table of the thesis layer: it is read and appended to, and
 * nothing here can update or remove a row — A2's "append-only" as the double's
 * own shape, so a writer that tried would meet an undefined delegate method
 * rather than a double that quietly agreed.
 *
 * The rows are reached through `store[key]` at CALL time, never captured,
 * because `resetDouble` replaces each array.
 */
function appendOnly(model: string, key: ThesisRowsKey) {
  return {
    // HONOURS ITS `where` — equality over every field it names, as
    // `thesisVersion.findMany` does (round 2, M2). A double that answered every
    // row whatever it was asked would let a query that forgot its `thesisId`
    // read another thesis's rows and pass.
    findMany: jest.fn(
      ask(model, 'findMany', (args?: { where?: Row }) => {
        const where = Object.entries(args?.where ?? {});
        return Promise.resolve(store[key].filter((row) => where.every(([field, value]) => row[field] === value)));
      }),
    ),
    findUnique: jest.fn(
      ask(model, 'findUnique', (args: { where?: { id?: string } }) =>
        Promise.resolve(store[key].find((r) => r['id'] === args.where?.id) ?? null),
      ),
    ),
    create: jest.fn((args: { data: Row }) => {
      record(model, 'create', args.data);
      const created = { id: `${model}-${String(store[key].length + 1)}`, ...args.data };
      store[key].push(created);
      return Promise.resolve(created);
    }),
  };
}

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

/**
 * THE STORE AS IT STANDS, and the one act that puts it back — thesis step 17,
 * additive (7.3). Every field is taken, each array copied, by WALKING the store
 * rather than listing it: a field added later is rolled back without anyone
 * editing this — the property-not-enumeration rule `WRITE_VERBS` states above. No
 * delegate mutates a row in place (each replaces a field or appends to a list), so
 * a shallow copy of every array is the whole state.
 */
function snapshotStore(): () => void {
  const saved = Object.entries(store).map(([field, value]) => [field, Array.isArray(value) ? [...value] : value] as const);
  return () => {
    for (const [field, value] of saved) Reflect.set(store, field, value);
  };
}

/**
 * ONE TRANSACTION, ROLLED BACK WHOLE WHEN ITS CALLBACK REJECTS — thesis step 17,
 * additive (7.3). The STORE is left as the transaction found it, as a database
 * leaves its rows; the writes the callback made through the transaction's client
 * are named in `rolledBack`, and `written` keeps them as the attempt log it has
 * always been. A callback that resolves is untouched: every consumer's
 * transaction commits exactly as before.
 */
export const defaultTransaction = async (fn: unknown, options?: unknown): Promise<unknown> => {
  windows.push(options);
  if (typeof fn !== 'function') return undefined;
  const from = writtenViaTx.length;
  const restore = snapshotStore();
  try {
    return await (fn as (tx: unknown) => Promise<unknown>)(transactionClient());
  } catch (err) {
    rolledBack.push(...writtenViaTx.slice(from));
    restore();
    throw err;
  }
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
    // BY ID ONCE A SUITE HOLDS THE THESIS LIST — thesis step 17, additive (7.3).
    // NO_THESIS is a `thesisId` naming no row, and it is unwritable against a
    // double that answers the one loaded thesis to every id. A suite that sets only
    // `store.thesis` — `test/debate.test.ts`, the one consumer that reaches this
    // delegate — answers as it always did: the fallback is scoped exactly as
    // `thesisVersion.findUnique`'s is. Recorded in `asked`, as the other lookups
    // a thesis tool makes first are.
    findUnique: jest.fn(
      ask('thesis', 'findUnique', (args?: { where?: { id?: string } }) => {
        if (store.theses.length > 0) {
          return Promise.resolve(store.theses.find((t) => t['id'] === args?.where?.id) ?? null);
        }
        return Promise.resolve(store.thesis);
      }),
    ),
    // HONOURS `publishedVersionId: { not: null }` — the one question the
    // instrument asks. A double that returned every thesis would let a HEAD-only
    // citation be examined, and the non-firing control that holds the instrument
    // to PUBLISHED versions could not fire.
    findMany: jest.fn(
      ask('thesis', 'findMany', (args: { where?: Row }) => {
        const where = args.where ?? {};
        const pinnedOnly = where['publishedVersionId'] !== undefined;
        // THESIS STEP 17, additive: every OTHER field the `where` names by a plain
        // value is an EQUALITY — `createdById` for an author's reviews — as the
        // thesis tables' `findMany` is. `audit-theses` names only the pin, so its
        // answer is unchanged.
        const equalities = Object.entries(where).filter(
          ([field, v]) => field !== 'publishedVersionId' && (typeof v !== 'object' || v === null),
        );
        return Promise.resolve(
          store.theses.filter(
            (t) => (!pinnedOnly || t['publishedVersionId'] != null) && equalities.every(([f, v]) => t[f] === v),
          ),
        );
      }),
    ),
    // THESIS STEP 17, additive: the version write creates a thesis and moves its
    // pointers. Each records, as every write here does.
    create: jest.fn((args: { data: Row }) => {
      record('thesis', 'create', args.data);
      const created = { id: `thesis-${String(store.theses.length + 1)}`, ...args.data };
      store.theses.push(created);
      return Promise.resolve(created);
    }),
    // RESPECTS ITS `where` (round 2, L4): the row updated is the one named, and a
    // name the double does not hold REJECTS, as Prisma's `update` does (P2025) —
    // never a silent write onto whichever thesis happened to be loaded.
    update: jest.fn((args: { where: { id?: string }; data: Row }) => {
      const id = args.where.id;
      const held = store.theses.find((t) => t['id'] === id) ?? (store.thesis?.['id'] === id ? store.thesis : null);
      if (held === null) {
        return Promise.reject(new Error(`the double holds no Thesis ${String(id)} — an update of it rejects`));
      }
      record('thesis', 'update', args.data);
      const updated = { ...held, ...args.data };
      store.theses = store.theses.map((t) => (t['id'] === id ? updated : t));
      if (store.thesis?.['id'] === id) store.thesis = updated;
      return Promise.resolve(updated);
    }),
  },
  thesisVersion: {
    // BY ID ONCE A SUITE HOLDS THE VERSION LIST — thesis step 17, additive (7.2
    // round 2). REVIEWS reads HEAD and PUBLISHED apart, and a double that answered
    // the one loaded version to every id would hand a reading of PUBLISHED the
    // head's row. A suite that sets only `store.version` — `test/debate.test.ts`,
    // the one evidence consumer that sets either — answers as it always did: the
    // fallback is scoped exactly as `thesisMention.findUnique`'s is.
    findUnique: jest.fn((args?: { where?: { id?: string } }) => {
      if (store.versions.length > 0) {
        return Promise.resolve(store.versions.find((v) => v['id'] === args?.where?.id) ?? null);
      }
      return Promise.resolve(store.version);
    }),
    // THESIS STEP 17, additive. A version is created and never updated (A2), so
    // there is no `update` here for a writer to reach.
    findMany: jest.fn(
      ask('thesisVersion', 'findMany', (args: { where?: { thesisId?: string } }) => {
        const thesisId = args.where?.thesisId;
        return Promise.resolve(
          thesisId === undefined ? store.versions : store.versions.filter((v) => v['thesisId'] === thesisId),
        );
      }),
    ),
    create: jest.fn((args: { data: Row }) => {
      record('thesisVersion', 'create', args.data);
      const created = { id: `version-${String(store.versions.length + 1)}`, ...args.data };
      store.versions.push(created);
      return Promise.resolve(created);
    }),
  },
  thesisMention: {
    findFirst: jest.fn(() => Promise.resolve(store.mention)),
    // FILTERED ONLY WHEN THE CALLER NAMES A VERSION. `publishableEvidence` asks
    // `{ thesisVersionId, type }`; `evidenceReviews.citationsOf` asks by
    // `refId` and a version relation, and answers as it always did.
    //
    // THESIS STEP 17, additive (7.2 round 2): A2's TARGET names — `versionId`,
    // `kind` — are honoured exactly as today's are. The thesis suite seeds its
    // mention rows under both until step 18 renames the columns, and a thesis
    // predicate asking in the target's words must see the one version it names:
    // REVIEWS reads HEAD's mentions and PUBLISHED's apart, and a double that
    // answered every row to `{ versionId }` would let a head-only reading pass a
    // case about the published version. No evidence-layer caller can send the
    // target names — they are not columns of today's schema — so every answer
    // those callers get is unchanged.
    findMany: jest.fn(
      ask(
        'thesisMention',
        'findMany',
        (args: { where?: { thesisVersionId?: string; type?: string; versionId?: string; kind?: string } }) => {
          const where = args.where ?? {};
          if (where.thesisVersionId === undefined && where.versionId === undefined) {
            return Promise.resolve(store.mentions);
          }
          return Promise.resolve(
            store.mentions.filter(
              (m) =>
                (where.thesisVersionId === undefined || m['thesisVersionId'] === where.thesisVersionId) &&
                (where.versionId === undefined || m['versionId'] === where.versionId) &&
                (where.type === undefined || m['type'] === where.type) &&
                (where.kind === undefined || m['kind'] === where.kind),
            ),
          );
        },
      ),
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
    // THESIS STEP 17, additive (7.3): the version write creates a version's
    // mentions, one row per (kind, name). Each records, and joins the list
    // `findMany` answers from — so a second write reads the first one's rows.
    create: jest.fn((args: { data: Row }) => {
      record('thesisMention', 'create', args.data);
      const created = { id: `thesisMention-${String(store.mentions.length + 1)}`, ...args.data };
      store.mentions.push(created);
      return Promise.resolve(created);
    }),
    createMany: jest.fn((args: { data: Row[] }) => {
      for (const d of args.data) {
        record('thesisMention', 'create', d);
        store.mentions.push({ id: `thesisMention-${String(store.mentions.length + 1)}`, ...d });
      }
      return Promise.resolve({ count: args.data.length });
    }),
    // HONOURS ITS `where` — thesis step 17, additive (7.5b; 7.2 round 1, Q3). It
    // answered `store.mentions.length` whatever it was asked, so `publicPage` — "is a
    // record of this page cited by a version that IS the pin?" — was answered by the
    // number of rows, and PUBLIC_PAGE's arms could not be told apart. It now applies
    // the shapes that question sends: a plain equality, `{ in }` on a field, and the
    // relation `thesisVersion: { isPublished: { isNot: null } }` over the relation a
    // mention row carries (`test/thesis/rows.ts`). Any other shape REJECTS rather
    // than agreeing; no `where` at all answers every row, as it always did.
    count: jest.fn(
      ask('thesisMention', 'count', (args?: { where?: Row }) => {
        const tests: ((row: Row) => boolean)[] = [];
        for (const [field, cond] of Object.entries(args?.where ?? {})) {
          if (typeof cond !== 'object' || cond === null) {
            tests.push((row) => row[field] === cond);
          } else if ('in' in cond && Array.isArray(cond.in) && Object.keys(cond).length === 1) {
            const wanted: readonly unknown[] = cond.in;
            tests.push((row) => wanted.includes(row[field]));
          } else if (field === 'thesisVersion' && JSON.stringify(cond) === JSON.stringify({ isPublished: { isNot: null } })) {
            tests.push((row) => {
              const version = row['thesisVersion'];
              return typeof version === 'object' && version !== null && 'isPublished' in version && version.isPublished != null;
            });
          } else {
            return Promise.reject(
              new Error(`the double does not model a thesisMention count where on ${field}: ${JSON.stringify(cond)}`),
            );
          }
        }
        return Promise.resolve(store.mentions.filter((row) => tests.every((test) => test(row))).length);
      }),
    ),
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
  cdxIndexEntry: {
    // HONOURS THE `where` FIELDS ITS ROW CARRIES — thesis step 17, additive (7.3
    // round 2, M1), the `evidence.findUnique` fallback pattern. It answered
    // `store.workList` whatever it was asked, so `lookupCapture`
    // (services/corpusReads.ts) read ANY timestamp as the one row's: an unheld
    // capture came back NOT_ACQUIRED where the ONE lookup answers UNKNOWN. A row
    // that names a field must match the value asked for; a row naming none of them
    // — `test/debate.test.ts` seeds `{ status: 'SKIPPED' }` — answers as it always
    // did. An operator the double does not model (an object-valued condition)
    // REJECTS rather than agreeing.
    findFirst: jest.fn(
      ask('cdxIndexEntry', 'findFirst', (args?: { where?: Row }) => {
        const held = store.workList;
        if (held === null) return Promise.resolve(null);
        const where = Object.entries(args?.where ?? {});
        const operator = where.find(([, value]) => typeof value === 'object' && value !== null);
        if (operator !== undefined) {
          return Promise.reject(
            new Error(`the double does not model a cdxIndexEntry where on ${operator[0]}: ${JSON.stringify(operator[1])}`),
          );
        }
        const disagrees = where.some(([field, value]) => held[field] !== undefined && held[field] !== value);
        return Promise.resolve(disagrees ? null : held);
      }),
    ),
  },
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
    // ANSWERS FROM A STORE LIST AND HONOURS ITS `where` — thesis step 17, additive
    // (7.2 round 3): equality over every field it names, as the thesis tables'
    // `findMany` does, so a HISTORY that forgot its `thesisId` reads another
    // thesis's debates and fails. No `src/` module asks it today (grepped) and no
    // consumer seeds `store.debates`, so every suite gets the `[]` it always got.
    findMany: jest.fn((args?: { where?: Row }) => {
      const where = Object.entries(args?.where ?? {});
      return Promise.resolve(store.debates.filter((row) => where.every(([field, value]) => row[field] === value)));
    }),
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
  // THE CLAIMTRAJECTORY ROWS a `#tr_` token is resolved against — thesis step 17,
  // additive (7.3). HONOURS the `where` shapes its callers send — plain
  // equalities (the co-movement's `{ computationId }`) and `in` on any field
  // (`resolveTrajectoryCitations`' `{ id: { in } }`, the counterparts'
  // `{ computationId, claimHash: { in } }`) — and REJECTS any other operator, so a
  // query this double does not model fails loudly instead of agreeing with it.
  claimTrajectory: {
    findMany: jest.fn(
      ask('claimTrajectory', 'findMany', (args?: { where?: Row }) => {
        const tests: ((row: Row) => boolean)[] = [];
        for (const [field, cond] of Object.entries(args?.where ?? {})) {
          if (typeof cond !== 'object' || cond === null) {
            tests.push((row) => row[field] === cond);
          } else if ('in' in cond && Array.isArray(cond.in) && Object.keys(cond).length === 1) {
            const wanted: readonly unknown[] = cond.in;
            tests.push((row) => wanted.includes(row[field]));
          } else {
            return Promise.reject(
              new Error(`the double does not model a claimTrajectory where on ${field}: ${JSON.stringify(cond)}`),
            );
          }
        }
        return Promise.resolve(store.trajectories.filter((row) => tests.every((test) => test(row))));
      }),
    ),
  },
  // THE THESIS LAYER'S APPEND-ONLY TABLES — thesis step 17, additive (A2).
  //
  // THE FRAMING ALONE ALSO UPDATES (7.3). A2 marks its ROUNDS append-only
  // (thesis flows :1302), not the framing, whose `thesisId` is "set by
  // create_thesis or by open_framing on a thesis" (:1297) — `create_thesis`
  // ATTACHES a framing that already exists. Its `update` honours its `where` as
  // `thesis.update` does, and an id the double does not hold REJECTS (P2025).
  framing: {
    ...appendOnly('framing', 'framings'),
    update: jest.fn((args: { where: { id?: string }; data: Row }) => {
      const id = args.where.id;
      const held = store.framings.find((f) => f['id'] === id);
      if (held === undefined) {
        return Promise.reject(new Error(`the double holds no Framing ${String(id)} — an update of it rejects`));
      }
      record('framing', 'update', args.data);
      const updated = { ...held, ...args.data };
      store.framings = store.framings.map((f) => (f['id'] === id ? updated : f));
      return Promise.resolve(updated);
    }),
  },
  framingRound: appendOnly('framingRound', 'framingRounds'),
  thesisAnalysis: appendOnly('thesisAnalysis', 'analyses'),
  thesisGapDecision: appendOnly('thesisGapDecision', 'gapDecisions'),
  publicationAttempt: appendOnly('publicationAttempt', 'attempts'),
  withdrawal: appendOnly('withdrawal', 'withdrawals'),
  note: appendOnly('note', 'notes'),
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
  rolledBack.length = 0;
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
  store.versions = [];
  store.framings = [];
  store.framingRounds = [];
  store.analyses = [];
  store.gapDecisions = [];
  store.attempts = [];
  store.withdrawals = [];
  store.notes = [];
  store.debates = [];
  store.trajectories = [];
  db.diffDebateSession.findUnique.mockImplementation(defaultSessionLookup);
  db.$transaction.mockImplementation(defaultTransaction);
  db.trackedUrl.findUnique.mockReturnValue(Promise.resolve(PAGE));
}
