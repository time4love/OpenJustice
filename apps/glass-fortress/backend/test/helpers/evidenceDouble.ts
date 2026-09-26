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

import { Prisma } from '@prisma/client';
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
   * THE FRAMING ROUND'S — thesis step 19, ADDITIVELY, and a THIRD flag rather than a reuse of
   * either above, for the rule this block already states.
   *
   * It arms exactly ONE collision and CLEARS ITSELF when it fires, because that is what a race on
   * `FramingRound @@unique([framingId, sequence])` produces: the loser recomputes its sequence and
   * the second insert succeeds. A flag that stayed armed would make the retry fail too, and the
   * case that asserts the paid call is drawn exactly once ACROSS the retry could never reach its
   * second write.
   */
  collideOnFramingRoundCreate: null as Error | null,
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
  /**
   * The researchers `researcher.findMany` answers — thesis step 20, additive (R47 §6-R8): `list_theses` names
   * a published thesis's author by HANDLE (thesis A4 :1427; `Researcher.handle`). Empty by default, so a suite
   * that seeds nothing is answered `[]` — and a handler that needs an author the store does not hold throws.
   */
  researchers: [] as Row[],
  /**
   * The detection passes `claimTrajectoryComputation.findFirst` answers — thesis step 20, additive (R47 E6): a
   * `#tr_` citation resolves through THE ONE RESOLVER, `resolveTrajectoryCitations`, which asks for each cited
   * page's newest pass. Empty by default, so the answer is `null` — "no newer pass" — exactly as a database
   * holding none would answer.
   */
  computations: [] as Row[],
  /**
   * THE PAGES a corpus-wide read finds — UI-2 (R52 sketch §e2), additive. Empty by default, and while empty the
   * `trackedUrl` delegates answer `PAGE` / `[PAGE]` to any `where`, as they always did; a suite that seeds the list
   * gets a lookup by `id` or `url` and a `findMany` over it — the `thesis.findUnique` :498–:505 fallback shape. A
   * two-page world (a public page beside a private one) is unwritable without it.
   */
  pages: [] as Row[],
  /**
   * THE WALK'S READS, for the research routes — UI-3 (R53 sketch §e2), additive. `workListRows` is a page's whole work-list
   * as `loadWorkListRows` reads it (the single `workList` row answers as it always did while this is empty); `rules` and
   * `ruleMatches` are what `get_article_rules`, `list_captures` and `get_rule_history` ask for. Empty by default, so a
   * suite that seeds none is answered as before.
   */
  workListRows: [] as Row[],
  rules: [] as Row[],
  ruleMatches: [] as Row[],
  /**
   * THE DOCUMENT LAYER'S ROWS — document step 33, additive (R81 Q1; the sketch's [R1-4]). A `#doc_` citation resolves
   * through `documentCitation.documentsByCommitment`, and check 18 reads the openings in force. Empty by default, so a
   * suite that seeds none is answered `[]` — a `#doc_` naming no document, exactly as a database holding none answers.
   */
  documents: [] as Row[],
  documentContentVersions: [] as Row[],
  sheds: [] as Row[],
  documentOpeningDecisions: [] as Row[],
  /** Document step 34, additive (R84 chunk 3, DECLARED): the verdicts `publish_thesis` writes per quoted span (A2 :1313). */
  passageVerdicts: [] as Row[],
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
function appendOnly(model: string, key: ThesisRowsKey, unique: readonly string[] = []) {
  return {
    // HONOURS ITS `where` — equality over every field it names, as
    // `thesisVersion.findMany` does (round 2, M2). A double that answered every
    // row whatever it was asked would let a query that forgot its `thesisId`
    // read another thesis's rows and pass.
    //
    // AND `{ in: [...] }` ON A FIELD — thesis step 20, additive (R47 E3): HISTORY
    // reads a thesis's rounds by its framings' ids and its analyses by its
    // versions' ids. Before this an `{ in }` condition was compared by `===` and
    // answered `[]` SILENTLY. Any OTHER object condition REJECTS, so a query this
    // double does not model fails loudly instead of agreeing with it.
    findMany: jest.fn(
      ask(model, 'findMany', (args?: { where?: Row }) => {
        const tests = whereTests(model, args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        return Promise.resolve(store[key].filter((row) => tests.every((test) => test(row))));
      }),
    ),
    findUnique: jest.fn(
      ask(model, 'findUnique', (args: { where?: { id?: string } }) =>
        Promise.resolve(store[key].find((r) => r['id'] === args.where?.id) ?? null),
      ),
    ),
    // THE UNIQUE INDEX, MODELLED — thesis step 22, additive (R48 E7, REVIEW's Q5). Where the table declares one
    // (`ThesisGapDecision @@unique([thesisId, gapId, sequence])`, `ThesisAnalysis @@unique([versionId,
    // inputFingerprint])`), a row equal on every indexed column to a held row REJECTS with the P2002 Prisma raises,
    // its `meta.target` naming the columns — and records nothing. Not an armed flag: a flag lets ANY caught error
    // pass for the collision, and a caller that forgot to read `meta.target` would pass with it.
    create: jest.fn((args: { data: Row }) => {
      if (unique.length > 0 && store[key].some((row) => unique.every((field) => row[field] === args.data[field]))) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${unique.join(', ')})`, {
            code: 'P2002',
            clientVersion: 'double',
            meta: { target: [...unique] },
          }),
        );
      }
      record(model, 'create', args.data);
      const created = { id: `${model}-${String(store[key].length + 1)}`, ...args.data };
      store[key].push(created);
      return Promise.resolve(created);
    }),
  };
}

/**
 * A `where` as row tests: a plain value is an EQUALITY, `{ in: [...] }` is membership, and any other object
 * condition is an Error naming what the double does not model — thesis step 20, additive (R47 E3–E5).
 */
function whereTests(model: string, where: Row | undefined): ((row: Row) => boolean)[] | Error {
  const tests: ((row: Row) => boolean)[] = [];
  for (const [field, cond] of Object.entries(where ?? {})) {
    if (typeof cond !== 'object' || cond === null) {
      tests.push((row) => row[field] === cond);
    } else if ('in' in cond && Array.isArray(cond.in) && Object.keys(cond).length === 1) {
      const wanted: readonly unknown[] = cond.in;
      tests.push((row) => wanted.includes(row[field]));
    } else {
      return new Error(`the double does not model a ${model} where on ${field}: ${JSON.stringify(cond)}`);
    }
  }
  return tests;
}

/**
 * `{ publicationAttempts: { some: { outcome: X } } }` — `EVER_PUBLISHED`'s shape (services/evidencePredicates.ts) — as its
 * outcome, or null for any other condition. Thesis step 23, additive (R49 §e6 E8, E9): one reader of the shape for both
 * delegates that answer it, so the two cannot model it differently.
 */
function everPublishedOutcome(cond: unknown): string | null {
  if (typeof cond !== 'object' || cond === null) return null;
  const keys = Object.keys(cond);
  if (keys.length !== 1 || keys[0] !== 'publicationAttempts') return null;
  const attempts = (cond as { publicationAttempts: unknown }).publicationAttempts;
  if (typeof attempts !== 'object' || attempts === null || JSON.stringify(Object.keys(attempts)) !== '["some"]') return null;
  const some = (attempts as { some: unknown }).some;
  if (typeof some !== 'object' || some === null || JSON.stringify(Object.keys(some)) !== '["outcome"]') return null;
  const outcome = (some as { outcome: unknown }).outcome;
  return typeof outcome === 'string' ? outcome : null;
}

/**
 * THE VERSION LIST, as `thesisVersion.findMany` and `findFirst` read it — thesis step 23, ADDITIVE (R49 §e6 E9).
 *
 * THREE ARMS: a plain value is an EQUALITY (`thesisId` exactly as before, `id` newly), `{ in: [...] }` is membership, and
 * `publicationAttempts: { some: { outcome } }` holds for a version the store's attempts name with that outcome. ANY OTHER
 * KEY IS IGNORED — never a rejection — because before this every key but `thesisId` was ignored, and a caller written
 * against that double must keep its answer (the R49 round-1 M1).
 */
function versionsWhere(where: Row | undefined): Row[] {
  const tests: ((row: Row) => boolean)[] = [];
  for (const [field, cond] of Object.entries(where ?? {})) {
    if (field === 'publicationAttempts') {
      const outcome = everPublishedOutcome({ publicationAttempts: cond });
      if (outcome !== null) tests.push((row) => store.attempts.some((a) => a['versionId'] === row['id'] && a['outcome'] === outcome));
    } else if (typeof cond !== 'object' || cond === null) {
      tests.push((row) => row[field] === cond);
    } else if ('in' in cond && Array.isArray(cond.in) && Object.keys(cond).length === 1) {
      const wanted: readonly unknown[] = cond.in;
      tests.push((row) => wanted.includes(row[field]));
    }
  }
  return store.versions.filter((row) => tests.every((test) => test(row)));
}

/**
 * A COMPARE-AND-SET, as Prisma's `updateMany` answers one — thesis step 20, additive (R47 E1, E2).
 *
 * Every `where` field is an EQUALITY, and a column the row does not carry reads as NULL — a database row has
 * null, never "absent", and a thesis the double created without a head must match `headVersionId: null`.
 * The rows matched are replaced in `rows` with `data` applied; the write is RECORDED only when a row was
 * touched, since an `updateMany` that matched nothing wrote nothing. Answers `{ count }`, never a throw:
 * the caller decides what a count of zero means.
 */
function compareAndSet(model: string, rows: Row[], args: { where: Row; data: Row }): { rows: Row[]; count: number } {
  const matches = (row: Row): boolean =>
    Object.entries(args.where).every(([field, value]) => (row[field] ?? null) === value);
  const count = rows.filter(matches).length;
  if (count > 0) record(model, 'updateMany', args.data);
  return { rows: rows.map((row) => (matches(row) ? { ...row, ...args.data } : row)), count };
}

/**
 * The page every suite's fixtures sit on — IMPORTED from the corpus fixture, not
 * re-spelled. A second literal here would be a second answer to "which page is
 * this?", free to drift from the one the record names are computed against.
 */
export { PAGE, URL };

/**
 * A page by `id` or `url` once a suite holds the page list; the one page to ANY `where` while it holds none — UI-2,
 * additive. `resetDouble` re-installs it as `trackedUrl.findUnique`'s implementation (a `mockReturnValue` there would
 * stand for every case after one that set it, and would answer PAGE to a url the list does not hold).
 */
export const defaultPageLookup = (args?: { where?: { id?: string; url?: string } }): Promise<Row | null> => {
  if (store.pages.length === 0) return Promise.resolve(PAGE);
  const where = args?.where ?? {};
  return Promise.resolve(store.pages.find((p) => (where.id !== undefined ? p['id'] === where.id : p['url'] === where.url)) ?? null);
};

/**
 * A `where` over rows that may LACK the fields it names — UI-2, additive, for the three corpus delegates that ignored
 * every condition before (`urlSnapshot`, `urlVersionDiff` and the page-shaped arm of `evidence`): an EQUALITY is
 * applied only where the row CARRIES the field, `{ in }` likewise, and every other condition is IGNORED — never a
 * rejection, because the consumers of those delegates were written against a double that ignored everything
 * (`ARCHIVED_CAPTURES_ONLY` sends `provenance` and `{ not: null }`, and no fixture row carries either). A row carrying
 * the field asked for must match it, so a corpus of two pages answers each page its own rows.
 */
function carriedWhere(row: Row, where: Row | undefined): boolean {
  for (const [field, cond] of Object.entries(where ?? {})) {
    if (!(field in row)) continue;
    if (typeof cond !== 'object' || cond === null) {
      if (row[field] !== cond) return false;
    } else if ('in' in cond && Array.isArray(cond.in) && Object.keys(cond).length === 1) {
      const wanted: readonly unknown[] = cond.in;
      if (!wanted.includes(row[field])) return false;
    }
  }
  return true;
}

/**
 * The page `publicPage` asks about — `{ OR: [{ snapshot: { trackedUrlId } }, { urlVersionDiff: { trackedUrlId } }] }`
 * (services/evidencePredicates.ts :427–:430) — or null for any other `where`. UI-2, additive.
 */
function pageOfOr(where: Row | undefined): string | null {
  const or = where?.['OR'];
  if (!Array.isArray(or)) return null;
  for (const arm of or) {
    if (typeof arm !== 'object' || arm === null) continue;
    for (const relation of ['snapshot', 'urlVersionDiff']) {
      const inner = (arm as Row)[relation];
      const id = typeof inner === 'object' && inner !== null ? (inner as Row)['trackedUrlId'] : undefined;
      if (typeof id === 'string') return id;
    }
  }
  return null;
}

/** An evidence row's page, through either relation — `undefined` when neither relation carries one (a legacy fixture). */
function evidencePageOf(row: Row): string | undefined {
  for (const relation of ['snapshot', 'urlVersionDiff']) {
    const inner = row[relation];
    const id = typeof inner === 'object' && inner !== null ? (inner as Row)['trackedUrlId'] : undefined;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

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
    .filter((w) => w.model === 'debateEvent')
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
    // THE HEAD'S COMPARE-AND-SET — thesis step 20, additive (R47 E1). `update` above honours `where.id` alone,
    // so a write against a head that moved could never lose; this honours every `where` field.
    updateMany: jest.fn((args: { where: Row; data: Row }) => {
      const { rows, count } = compareAndSet('thesis', store.theses, args);
      store.theses = rows;
      const held = store.thesis;
      if (held !== null) store.thesis = rows.find((t) => t['id'] === held['id']) ?? held;
      return Promise.resolve({ count });
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
    // THESIS STEP 23, ADDITIVE (R49 §e6 E9): equality, `in` and the EVER-PUBLISHED arm; any other key ignored, as
    // every key but `thesisId` always was — `versionsWhere` says why.
    findMany: jest.fn(
      ask('thesisVersion', 'findMany', (args?: { where?: Row }) => Promise.resolve(versionsWhere(args?.where))),
    ),
    findFirst: jest.fn(
      ask('thesisVersion', 'findFirst', (args?: { where?: Row }) => Promise.resolve(versionsWhere(args?.where).at(0) ?? null)),
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
    // `{ versionId, kind }`; `evidenceReviews.citationsOf` asks by `name` and a
    // version relation, and answers as it always did.
    //
    // A2's NAMES ONLY, since thesis step 18 renamed the columns (thesis flows A2
    // :1280–:1283). The arms that honoured the built names beside them lost their
    // last caller in that rename, and went with it. A predicate asking for one
    // version must see that version's rows: REVIEWS reads HEAD's mentions and
    // PUBLISHED's apart, and a double that answered every row to `{ versionId }`
    // would let a head-only reading pass a case about the published version.
    findMany: jest.fn(
      ask('thesisMention', 'findMany', (args: { where?: { versionId?: string | { in?: string[] }; kind?: string | { in?: string[] } } }) => {
        const where = args.where ?? {};
        if (where.versionId === undefined) return Promise.resolve(store.mentions);
        // AND `{ in }`, which `carriedWhere` already honours for every other delegate — R57 chunk 3's
        // `citationRefsByVersion` reads the mentions of EVERY published version in one query, so that a thesis
        // published five times costs one round trip and not five. Without this the hand-rolled `where` here
        // compared a row's id to the CONDITION OBJECT and answered nothing, which reads as "that version cites
        // nothing" rather than as an unsupported query.
        const wanted =
          typeof where.versionId === 'object' && where.versionId !== null
            ? (where.versionId.in ?? [])
            : [where.versionId];
        // `kind` TAKES `{ in }` TOO — document step 34, additive (DECLARED): the evidence half folds EVIDENCE and DOCUMENT
        // mentions in one query, and the equality below compared a row's kind to the CONDITION OBJECT and answered
        // nothing — the same "cites nothing" silence as above, one field along.
        const kinds =
          where.kind === undefined ? null : typeof where.kind === 'object' ? (where.kind.in ?? []) : [where.kind];
        return Promise.resolve(
          store.mentions.filter(
            (m) => wanted.includes(String(m['versionId'])) && (kinds === null || kinds.includes(String(m['kind']))),
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
          } else if (field === 'thesisVersion' && everPublishedOutcome(cond) !== null) {
            // THE EVER-PUBLISHED ARM — thesis step 23, additive (R49 §e6 E8): `publicPage` asks whether a version that
            // ever had a PUBLISHED attempt cites a record of the page, over the attempts the store holds.
            const outcome = everPublishedOutcome(cond);
            tests.push((row) => store.attempts.some((a) => a['versionId'] === row['versionId'] && a['outcome'] === outcome));
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
    // BY ID OR URL ONCE A SUITE HOLDS THE PAGE LIST — UI-2, additive (`defaultPageLookup` says why).
    findUnique: jest.fn(defaultPageLookup),
    // `verify_claim_text` asks `findFirst({ where: { url } })` (services/archiveVerification.ts :259) — the same lookup.
    findFirst: jest.fn(ask('trackedUrl', 'findFirst', defaultPageLookup)),
    // EVERY SURVEYED PAGE — `[PAGE]` while no list is held, as always; the list, equality `where` honoured, once it is.
    findMany: jest.fn((args?: { where?: Row }) =>
      Promise.resolve(store.pages.length === 0 ? [PAGE] : store.pages.filter((p) => carriedWhere(p, args?.where))),
    ),
  },
  urlSnapshot: {
    // A PAGE'S OWN CAPTURES once the rows carry `trackedUrlId` — UI-2, additive: equality and `{ in }` on fields the
    // row carries, every other condition ignored as before (`carriedWhere`).
    findMany: jest.fn((args?: { where?: Row }) => Promise.resolve(store.captures.filter((c) => carriedWhere(c, args?.where)))),
    // BY ID, from the same list `findMany` answers with. A double that returned
    // one fixed row would let a case about two captures pass while the code read
    // the wrong one.
    findUnique: jest.fn((args: { where: { id?: string } }) =>
      Promise.resolve(store.captures.find((c) => c['id'] === args.where.id) ?? null),
    ),
  },
  // A PAGE'S OWN DIFFS once the rows carry `trackedUrlId` — UI-2, additive, as `urlSnapshot` above.
  urlVersionDiff: { findMany: jest.fn((args?: { where?: Row }) => Promise.resolve(store.diffs.filter((d) => carriedWhere(d, args?.where)))) },
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
    // A PAGE'S WORK-LIST — thesis step 20, additive (R47 E4): the version write's second pass over a page's
    // rows, for a record name over a capture that was never ACQUIRED (§6-R1). Equality only — the pass
    // filters outcome and hash in code — and any object condition REJECTS. The held row answers only a
    // `where` naming ITS page.
    findMany: jest.fn(
      ask('cdxIndexEntry', 'findMany', (args?: { where?: Row }) => {
        // A WHOLE WORK-LIST once a suite holds one — UI-3, additive: the rows the `where` names by a field they carry,
        // in the order seeded (`loadWorkListRows` asks timestamp order; the suite seeds in it).
        if (store.workListRows.length > 0) return Promise.resolve(store.workListRows.filter((r) => carriedWhere(r, args?.where)));
        const tests = whereTests('cdxIndexEntry', args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        const held = store.workList;
        return Promise.resolve(held !== null && tests.every((test) => test(held)) ? [held] : []);
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
  pageDecision: {
    findUnique: jest.fn(() => Promise.resolve(store.pageDecisions.at(0) ?? null)),
    // A PAGE'S DECISION LOG — UI-3, additive: the rows the `where` names by a field they carry, in the order seeded
    // (the walk's reads ask `sequence` order; the suite seeds in it).
    findMany: jest.fn(ask('pageDecision', 'findMany', (args?: { where?: Row }) => Promise.resolve(store.pageDecisions.filter((d) => carriedWhere(d, args?.where))))),
  },
  // THE PAGE'S RULES AND WHAT THEY MATCHED — UI-3, additive, for the walk's three reads behind the research routes.
  rule: {
    findMany: jest.fn(ask('rule', 'findMany', (args?: { where?: Row }) => Promise.resolve(store.rules.filter((r) => carriedWhere(r, args?.where))))),
    findUnique: jest.fn(ask('rule', 'findUnique', (args?: { where?: { id?: string } }) => Promise.resolve(store.rules.find((r) => r['id'] === args?.where?.id) ?? null))),
  },
  ruleMatch: {
    findMany: jest.fn(ask('ruleMatch', 'findMany', (args?: { where?: Row }) => Promise.resolve(store.ruleMatches.filter((m) => carriedWhere(m, args?.where))))),
  },
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
    // AND THE PAGE-SHAPED `where` `publicPage` sends — UI-2, additive: a row whose relation carries the page asked for
    // answers; a row whose relations carry NO page (every legacy fixture) answers as it always did. Without this a
    // second page read PUBLIC through the first page's evidence rows.
    findMany: jest.fn(
      ask('evidence', 'findMany', (args: { where?: Row }) => {
        const named = args.where?.['fileHash'];
        const wanted =
          typeof named === 'object' && named !== null && Array.isArray((named as Row)['in']) ? ((named as Row)['in'] as unknown[]) : null;
        const page = pageOfOr(args.where);
        // THE SAME SINGLE-ROW FALLBACK `findUnique` ABOVE HAS, and it is here for the same stated reason: to
        // keep "every suite written against the single-row fixture green". R57 chunk 3 moved VERIFIED's read
        // from `findUnique` to `findMany` (one query for a whole set instead of one per citation), and without
        // this the two delegates disagreed about the SAME fixture — a case that set `store.evidence` answered
        // a row through one and nothing through the other, so a predicate reported NOT_PROMOTED about a record
        // the case had plainly promoted. The fallback fires only when a NAME was asked for and `evidenceRows`
        // holds none of them, which is exactly the legacy shape; a case that sets `evidenceRows` is untouched.
        const held = store.evidence;
        const rows = store.evidenceRows.filter((r) => {
            if (wanted !== null && !wanted.includes(String(r['fileHash']))) return false;
            if (page === null) return true;
            const own = evidencePageOf(r);
            return own === undefined || own === page;
          });
        if (rows.length === 0 && wanted !== null && held !== null) {
          const its = held['fileHash'];
          const matches = its === undefined || wanted.includes(String(its));
          const ownPage = evidencePageOf(held);
          if (matches && (page === null || ownPage === undefined || ownPage === page)) return Promise.resolve([held]);
        }
        return Promise.resolve(
          rows,
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
  debateSession: {
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
      record('debateSession', 'create', args.data);
      return Promise.resolve({ id: 'session-1' });
    }),
    update: jest.fn((args: { data: Row }) => {
      record('debateSession', 'update', args.data);
      return Promise.resolve({});
    }),
  },
  debateEvent: {
    // A DEBATE'S EVENTS, BY SESSION — R66, additive. The transcript builds a thesis's DEBATE turns from every
    // session at once, so it asks this table once by `{ sessionId: { in: [...] } }` rather than nesting a
    // select per session. The rows come from the ONE held session's own `events`, plus what this run wrote —
    // the same read-back `debateSession.findUnique` does, and for the same stated reason: a double whose
    // events were frozen would let a caller look right while reading the wrong turns.
    findMany: jest.fn(
      ask('debateEvent', 'findMany', (args?: { where?: Row }) => {
        const session = store.session;
        if (session === null) return Promise.resolve([]);
        const wanted = args?.where?.['sessionId'];
        const ids =
          typeof wanted === 'object' && wanted !== null && Array.isArray((wanted as Row)['in'])
            ? ((wanted as Row)['in'] as unknown[]).map(String)
            : wanted === undefined
              ? null
              : [String(wanted)];
        if (ids !== null && !ids.includes(String(session['id']))) return Promise.resolve([]);
        const base = ((session['events'] ?? []) as Row[]).map((e, index) => ({
          id: e['id'] ?? `event-${String(index + 1)}`,
          sessionId: session['id'],
          ...e,
        }));
        const appended = written
          .filter((w) => w.model === 'debateEvent')
          .map((w, index) => ({
            id: `written-event-${String(index + 1)}`,
            sessionId: w.data['sessionId'] ?? session['id'],
            type: w.data['type'],
            content: w.data['content'],
            createdAt: new Date(),
          }));
        return Promise.resolve([...base, ...appended]);
      }),
    ),
    create: jest.fn((args: { data: Row }) => {
      record('debateEvent', 'create', args.data);
      return Promise.resolve({});
    }),
    createMany: jest.fn((args: { data: Row[] }) => {
      for (const d of args.data) record('debateEvent', 'create', d);
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
  // A PAGE'S NEWEST DETECTION PASS — thesis step 20, additive (R47 E6). Equality on the `where`, the newest by
  // `computedAt` when the caller orders `desc` (the one order the resolver sends), and any other `orderBy`
  // REJECTS rather than agreeing with it.
  claimTrajectoryComputation: {
    findFirst: jest.fn(
      ask('claimTrajectoryComputation', 'findFirst', (args?: { where?: Row; orderBy?: Row }) => {
        const tests = whereTests('claimTrajectoryComputation', args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        const order = JSON.stringify(args?.orderBy ?? null);
        if (order !== JSON.stringify({ computedAt: 'desc' })) {
          return Promise.reject(new Error(`the double does not model a claimTrajectoryComputation orderBy ${order}`));
        }
        const newest = store.computations
          .filter((row) => tests.every((test) => test(row)))
          .sort((a, b) => Number(b['computedAt']) - Number(a['computedAt']));
        return Promise.resolve(newest.at(0) ?? null);
      }),
    ),
    // THE PASS FOR ONE STATE — UI-2, additive: `readComputation` (services/claimTrajectory.ts :768–:776) asks by the
    // compound key `trackedUrlId_sourceStateHash` and includes the pass's rows; the stored read `list_trajectories`
    // and the KEEP tool's cache hit both go through it, and a HIT is what lets the equality case run with no write.
    findUnique: jest.fn(
      ask('claimTrajectoryComputation', 'findUnique', (args: { where: { trackedUrlId_sourceStateHash?: { trackedUrlId: string; sourceStateHash: string } } }) => {
        const key = args.where.trackedUrlId_sourceStateHash;
        if (key === undefined) return Promise.reject(new Error('the double models claimTrajectoryComputation.findUnique by trackedUrlId_sourceStateHash only'));
        const row = store.computations.find((c) => c['trackedUrlId'] === key.trackedUrlId && c['sourceStateHash'] === key.sourceStateHash);
        if (row === undefined) return Promise.resolve(null);
        return Promise.resolve({ ...row, trajectories: store.trajectories.filter((t) => t['computationId'] === row['id']) });
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
    // THE ATTACHMENT'S COMPARE-AND-SET — thesis step 20, additive (R47 E2): `create_thesis` attaches a framing
    // only while it is attached to nothing (`where: { id, thesisId: null }`).
    updateMany: jest.fn((args: { where: Row; data: Row }) => {
      const { rows, count } = compareAndSet('framing', store.framings, args);
      store.framings = rows;
      return Promise.resolve({ count });
    }),
  },
  framingRound: {
    ...appendOnly('framingRound', 'framingRounds'),
    create: jest.fn((args: { data: Row }) => {
      const armed = store.collideOnFramingRoundCreate;
      if (armed !== null) {
        store.collideOnFramingRoundCreate = null;
        return Promise.reject(armed);
      }
      record('framingRound', 'create', args.data);
      const created = { id: `framingRound-${String(store.framingRounds.length + 1)}`, ...args.data };
      store.framingRounds.push(created);
      return Promise.resolve(created);
    }),
  },
  thesisAnalysis: appendOnly('thesisAnalysis', 'analyses', ['versionId', 'inputFingerprint']),
  thesisGapDecision: appendOnly('thesisGapDecision', 'gapDecisions', ['thesisId', 'gapId', 'sequence']),
  publicationAttempt: appendOnly('publicationAttempt', 'attempts'),
  // DOCUMENT STEP 34, additive (DECLARED): `publish_thesis` writes the verdicts in ONE bulk call inside its transaction
  // (memory: the 5 s window) — each row recorded as written, so "a refused attempt writes none" is a read of `written`.
  passageVerdict: {
    createMany: jest.fn((args: { data: Row[] }) => {
      for (const row of args.data) {
        store.passageVerdicts.push(row);
        record('passageVerdict', 'createMany', row);
      }
      return Promise.resolve({ count: args.data.length });
    }),
  },
  withdrawal: appendOnly('withdrawal', 'withdrawals'),
  note: appendOnly('note', 'notes'),
  // THE AUTHORS `list_theses` names — thesis step 20, additive (R47 E5): `{ id: { in } }` and equality, any
  // other operator REJECTS.
  researcher: {
    findMany: jest.fn(
      ask('researcher', 'findMany', (args?: { where?: Row }) => {
        const tests = whereTests('researcher', args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        return Promise.resolve(store.researchers.filter((row) => tests.every((test) => test(row))));
      }),
    ),
    // THE GATE'S LOOKUP — UI-3, additive: `requireResearcher` asks `{ supabaseUserId }`. STRICT equality on every field
    // the `where` names — a researcher row lacking the field is not a match, or a login would find someone else.
    findUnique: jest.fn(
      ask('researcher', 'findUnique', (args?: { where?: Row }) =>
        Promise.resolve(store.researchers.find((row) => Object.entries(args?.where ?? {}).every(([field, v]) => row[field] === v)) ?? null),
      ),
    ),
  },
  // DOCUMENT STEP 33, additive: reads only — no writer of these tables is on a thesis or evidence path. `where` through
  // `whereTests` (equality and `in`; anything else REJECTS, by name); a document's `include` of its versions and its shed
  // is answered from the rows seeded beside it.
  document: {
    findMany: jest.fn(
      ask('document', 'findMany', (args?: { where?: Row; include?: { versions?: boolean; shed?: boolean } }) => {
        const tests = whereTests('document', args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        return Promise.resolve(
          store.documents
            .filter((row) => tests.every((test) => test(row)))
            .map((row) => ({
              ...row,
              ...(args?.include?.versions === true
                ? { versions: store.documentContentVersions.filter((v) => v['commitment'] === row['commitment']) }
                : {}),
              ...(args?.include?.shed === true ? { shed: store.sheds.find((s) => s['commitment'] === row['commitment']) ?? null } : {}),
            })),
        );
      }),
    ),
  },
  documentOpeningDecision: {
    findMany: jest.fn(
      ask('documentOpeningDecision', 'findMany', (args?: { where?: Row }) => {
        const tests = whereTests('documentOpeningDecision', args?.where);
        if (!Array.isArray(tests)) return Promise.reject(tests);
        return Promise.resolve(store.documentOpeningDecisions.filter((row) => tests.every((test) => test(row))));
      }),
    ),
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
  store.collideOnFramingRoundCreate = null;
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
  store.researchers = [];
  store.computations = [];
  store.pages = [];
  store.workListRows = [];
  store.rules = [];
  store.ruleMatches = [];
  store.documents = [];
  store.documentContentVersions = [];
  store.sheds = [];
  store.documentOpeningDecisions = [];
  store.passageVerdicts = [];
  db.debateSession.findUnique.mockImplementation(defaultSessionLookup);
  db.$transaction.mockImplementation(defaultTransaction);
  db.trackedUrl.findUnique.mockImplementation(defaultPageLookup);
}
