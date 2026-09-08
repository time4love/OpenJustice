import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// TARGET §9.8's INVARIANTS — "true after every step, not only at the end".
//
// The shape `test/walk/invariants.test.ts` holds for the flows' ten. Each line
// of §9.8's table is a rule someone could break without breaking a behaviour
// test, and several are properties of the SCHEMA rather than of any function —
// which is why they are asserted against `schema.prisma` and the migration
// itself. A CHECK constraint Prisma cannot express is still a constraint, and a
// test that only read the Prisma model would report it present when it is not.
// ---------------------------------------------------------------------------

const BACKEND = join(__dirname, '..', '..');
const schema = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(BACKEND, 'prisma', 'migrations', '20260908205356_evidence_step_11b', 'migration.sql'),
  'utf8',
);

/** The body of a model or enum block, by name. */
function block(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  const from = start === -1 ? schema.indexOf(`enum ${name} {`) : start;
  if (from === -1) throw new Error(`schema.prisma has no ${name} — the invariant has no subject`);
  let depth = 0;
  for (let i = from; i < schema.length; i++) {
    if (schema[i] === '{') depth++;
    else if (schema[i] === '}') {
      depth--;
      if (depth === 0) return schema.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

describe('§9.8 — Evidence.fileHash is ID(the record it is keyed to)', () => {
  it('exactly one of the three record keys is set, AND it matches kind — a CHECK, not a convention', () => {
    // "A row that fails it is malformed, and a tool that repaired it would hide
    // how it got that way." The constraint lives in the migration because Prisma
    // cannot express one; the model's comment names it so a reader of the schema
    // alone is not misled into thinking it is absent.
    expect(migration).toContain('CONSTRAINT "Evidence_one_record_key" CHECK');
    for (const kind of ['CAPTURE', 'DIFF', 'DOCUMENT']) {
      expect(migration).toContain(`"kind" = '${kind}'`);
    }
    // Named in the model's own docblock too, so a reader of `schema.prisma` alone
    // is not misled into thinking the constraint is absent.
    expect(schema).toContain('Evidence_one_record_key');
  });

  it('the three keys are each @unique — one evidence row per corpus record', () => {
    const evidence = block('Evidence');
    for (const key of ['snapshotId', 'urlVersionDiffId', 'documentCommitment']) {
      expect(evidence).toMatch(new RegExp(`${key}\\s+String\\?\\s+@unique`));
    }
  });
});

describe('§9.8 — the evidence row carries no prose and no opinion', () => {
  it('Evidence has no String column outside A2\'s own list', () => {
    // `evidence-no-prose`, stated as A2's column list rather than as a
    // hand-maintained allow-list: the list IS the contract, and a rule written as
    // an enumeration is tested against the same enumeration.
    const ALLOWED = new Set([
      'id',
      'fileHash',
      'snapshotId',
      'urlVersionDiffId',
      'documentCommitment',
      'affirmedContentVersionHash',
      'promotedById',
    ]);
    const strings = [...block('Evidence').matchAll(/^\s{2}(\w+)\s+String\??/gm)].map((m) => m[1]);
    expect(strings.filter((f) => !ALLOWED.has(f))).toEqual([]);
    expect(strings.length).toBeGreaterThan(0);
  });

  it('the OPINION register lives on the content version, and only there', () => {
    expect(block('DiffContentVersion')).toMatch(/classification\s+Json\?/);
    expect(block('Evidence')).not.toContain('classification');
  });

  it('the tier, the role and the summary are gone from the row', () => {
    const evidence = block('Evidence');
    for (const column of ['evidenceTier', 'evidenceRole', 'summary', 'investigativeCategories']) {
      expect(evidence).not.toContain(column);
    }
  });
});

describe('§9.8 — nothing above the corpus is anchored', () => {
  it('Evidence holds no chain state at all', () => {
    const evidence = block('Evidence');
    for (const column of ['onChainTxHash', 'anchoredHash', 'anchorCheck', 'previousFileHash']) {
      expect(evidence).not.toContain(column);
    }
  });

  it('a capture still does — the chain attests the CORPUS', () => {
    // The other half, and it is what makes the first half a design rather than a
    // deletion: the bytes are anchored at acquisition, by the walk, in the
    // deployment.
    expect(block('UrlSnapshot')).toContain('anchoredHash');
  });
});

describe('§9.8 — evidence has two statuses, and nothing moves WITHDRAWN back', () => {
  it('PROMOTED and WITHDRAWN, and no third', () => {
    const status = block('EvidenceStatus');
    expect(status).toContain('PROMOTED');
    expect(status).toContain('WITHDRAWN');
    expect(status).not.toContain('CONFIRMED');
    expect(status).not.toContain('PENDING_REVIEW');
    expect(status).not.toContain('SUPERSEDED');
  });

  it('the column has NO DEFAULT — both values are live claims a write must state', () => {
    expect(block('Evidence')).not.toMatch(/status\s+EvidenceStatus\s+@default/);
  });
});

describe('§9.8 — a diff is the PAIR it spans', () => {
  it('the two sides are two different captures — a CHECK, not a convention', () => {
    expect(migration).toContain('CONSTRAINT "UrlVersionDiff_pair_is_two_captures"');
    expect(migration).toContain('"beforeSnapshotId" <> "afterSnapshotId"');
  });

  it('the row holds no content: every version column is gone', () => {
    const diff = block('UrlVersionDiff');
    for (const column of ['deletedText', 'addedText', 'rawDeletedText', 'aiSignificance', 'survivalVerdict']) {
      expect(diff).not.toContain(column);
    }
    expect(diff).toContain('contentVersions');
  });
});

describe('§9.8 — a citation pins the record\'s affirmed version', () => {
  it('the mention carries the pin and the argument, and no role', () => {
    const mention = block('ThesisMention');
    expect(mention).toContain('contentVersionHash');
    expect(mention).toContain('debateSessionId');
    // Evidence A2 offered a `role` column and the thesis flows withdrew it (T2):
    // a role is meaningful only relative to a provision, and what a record does
    // here is the argument.
    expect(mention).not.toMatch(/^\s{2}role\s/m);
  });

  it('the record stores the version a HUMAN stood behind, not a derived pointer', () => {
    expect(block('Evidence')).toContain('affirmedContentVersionHash');
  });
});

describe('§9.8 — nothing is deleted after the rebuild', () => {
  it('no foreign key added by this step cascades or nulls on delete', () => {
    // A cascade is a deletion path standing open for a delete nobody intends to
    // write. The generator proposed SET NULL for the four nullable keys; the
    // hand-written migration makes every one RESTRICT.
    const added = [...migration.matchAll(/ADD CONSTRAINT "(\w+_fkey)"[^;]*ON DELETE (\w+)/g)];
    expect(added.length).toBeGreaterThanOrEqual(6);
    expect(added.filter(([, , action]) => action !== 'RESTRICT').map(([, name]) => name)).toEqual([]);
  });

  it('the review log is append-only, keyed by a compare-and-set', () => {
    expect(block('EvidenceDecision')).toContain('@@unique([fileHash, sequence])');
  });
});
