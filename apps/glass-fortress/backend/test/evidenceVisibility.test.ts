import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Request } from 'express';
import {
  PUBLIC_EVIDENCE_WHERE,
  evidenceWhereForViewer,
  viewerSeesUnreviewed,
} from '../src/lib/evidenceVisibility';

const asReq = (researcherId?: string) => ({ researcherId }) as unknown as Request;

describe('unreviewed evidence is not public', () => {
  it('a public viewer sees only CONFIRMED records', () => {
    expect(evidenceWhereForViewer(asReq())).toEqual({ status: 'CONFIRMED' });
    expect(viewerSeesUnreviewed(asReq())).toBe(false);
  });

  it('a researcher sees everything, because reviewing it is the job', () => {
    expect(evidenceWhereForViewer(asReq('r-1'))).toEqual({});
    expect(viewerSeesUnreviewed(asReq('r-1'))).toBe(true);
  });

  it('the public filter is CONFIRMED and nothing looser', () => {
    // A filter of {} would silently make everything public again, and the
    // difference is one character.
    expect(PUBLIC_EVIDENCE_WHERE).toEqual({ status: 'CONFIRMED' });
  });
});

describe('every route that reads evidence decides visibility the same way', () => {
  // `/evidence/latest` filtered on CONFIRMED while `/evidence/timeline`,
  // `/evidence/:id`, `/evidence/stats` and `/mentions/evidence` did not. One
  // rule, five implementations, four of them wrong — and records that had been
  // REJECTED at review were publicly readable while they existed.
  //
  // This scans the routes rather than testing them one by one, because testing
  // them one by one is exactly what missed four of them.
  const ROUTES = join(__dirname, '..', 'src', 'routes');
  const files = readdirSync(ROUTES)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(ROUTES, f))
    .filter((f) => statSync(f).isFile());

  it('no route file reads Evidence without a visibility decision', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const reads = /prisma\.evidence\.(findMany|findFirst|findUnique|count|groupBy)/.test(src);
      if (!reads) continue;

      // Either it defers to the shared rule, or every read on that path is
      // behind a researcher gate, or it filters explicitly on CONFIRMED.
      const decides =
        src.includes('evidenceWhereForViewer') ||
        src.includes('viewerSeesUnreviewed') ||
        src.includes('requireResearcher') ||
        src.includes("status: 'CONFIRMED'");
      if (!decides) offenders.push(file.slice(ROUTES.length + 1));
    }

    expect(offenders).toEqual([]);
  });
});

describe('every evidence response carries the canonical key', () => {
  // `canonicalTargetEntity` shipped resolved in the database and null in
  // GET /api/evidence/:id, because that route hand-builds its response instead
  // of using mapEvidenceToRecord. A field added to the shared shape does not
  // reach a shape that is not shared — the fourth instance of that pattern in
  // one day, after the evidence hash, the extractor and the tier rubric.
  const ROUTES = join(__dirname, '..', 'src', 'routes');

  it('any route serializing targetEntity also serializes the canonical key', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(ROUTES).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(ROUTES, file), 'utf8');
      // A response that names targetEntity by hand must name the key too.
      if (/targetEntity: (record|row|r|e)\./.test(src) && !src.includes('canonicalTargetEntity')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
