import {
  DESCRIBE_BOUND_PROVIDER,
  DESCRIBE_TOO_LARGE_BYTES,
  familyOf,
  IMAGE_BLOCK_BYTES,
  isAccepted,
  modelReadingOf,
  TOO_LARGE_BYTES,
} from '../src/lib/acceptedDocumentTypes';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESCRIBER_AGENT } from '../src/services/documentDescriber';

// ---------------------------------------------------------------------------
// WHAT THE RESEARCHER'S DOOR ACCEPTS — the ONE spelling (document step 30, R76).
//
// The set is the approved strip of boards י1/י2 (`docs/boards/gf-ui-boards-2026-09-22.html`):
// CSV · XLSX · PDF · image · audio · video · up to 50 MB. It is `add_document`'s ACCEPTED set and
// NOT the extractor's reader table: both hold (R76 chunk-1 grading) — `text/plain` is bytes-only
// to the extractor (round 2 §2) AND refused at the door, because the strip does not name it.
//
// THE MIGRATION HALF — `TOO_LARGE_BYTES` held EQUAL to the bucket migration's `file_size_limit`
// by reading the SQL — is the last describe block, landed with the migration at chunk 3.
// ---------------------------------------------------------------------------

describe('the accepted set is the board’s strip — six families, and nothing else', () => {
  it.each([
    ['application/pdf', 'PDF'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX'],
    ['text/csv', 'CSV'],
    ['text/csv; charset=utf-8', 'CSV'],
    ['image/png', 'IMAGE'],
    ['image/jpeg', 'IMAGE'],
    ['audio/wav', 'AUDIO'],
    ['video/mp4', 'VIDEO'],
  ])('%s is accepted as %s', (type, family) => {
    expect(isAccepted(type)).toBe(true);
    expect(familyOf(type)).toBe(family);
  });

  it.each(['text/plain', 'application/vnd.ms-excel', 'application/zip', 'application/x-msdownload', ''])(
    '%s is REFUSED at the door — the strip does not name it',
    (type) => {
      expect(isAccepted(type)).toBe(false);
    },
  );
});

describe('describe_document’s narrower set is DERIVED, never listed again (A4 :1440-:1441 as ruled)', () => {
  it('no model reads audio or video', () => {
    expect(modelReadingOf('AUDIO')).toBeNull();
    expect(modelReadingOf('VIDEO')).toBeNull();
  });

  it('an image or a PDF is read as its FILE; a spreadsheet through its computed TEXT', () => {
    expect(modelReadingOf('IMAGE')).toBe('FILE');
    expect(modelReadingOf('PDF')).toBe('FILE');
    expect(modelReadingOf('XLSX')).toBe('TEXT');
    expect(modelReadingOf('CSV')).toBe('TEXT');
  });
});

describe('the numbers ruled 2026-09-23', () => {
  it('TOO_LARGE is 50 MB — 52 428 800 bytes', () => {
    expect(TOO_LARGE_BYTES).toBe(52_428_800);
  });

  it('an image rides as an image block up to 5 MB — Q-C', () => {
    expect(IMAGE_BLOCK_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('the DESCRIBER’s bound — A4 :1440 as ruled 2026-09-23, measured for ONE provider', () => {
  const VARIABLE = `${DESCRIBER_AGENT}_PROVIDER`;
  const ORIGINAL = process.env[VARIABLE];
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[VARIABLE];
    else process.env[VARIABLE] = ORIGINAL;
  });

  it('is 50 MB as the researcher ruled — 50 000 000 bytes, below the door’s own cap', () => {
    expect(DESCRIBE_TOO_LARGE_BYTES).toBe(50_000_000);
    // The arm is reachable only because the door's cap sits above it (52 428 800).
    expect(DESCRIBE_TOO_LARGE_BYTES).toBeLessThan(TOO_LARGE_BYTES);
  });

  it('with the variable unset, the describer resolves to the provider the bound was MEASURED for — a change reddens here and forces a re-measure', () => {
    // The REAL factory: the describer's own suite mocks it at its boundary (`diffChunking.test.ts`'s precedent).
    const { resolveModelId } = jest.requireActual<{ resolveModelId: (agent: string) => string }>('../src/factories/LLMFactory');
    delete process.env[VARIABLE];
    expect(resolveModelId(DESCRIBER_AGENT).split(':').at(0)).toBe(DESCRIBE_BOUND_PROVIDER);
  });
});


describe('the bucket’s migration — the SECOND spelling of TOO_LARGE, held EQUAL (flows §12 :1185 as ruled)', () => {
  const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
  const folder = readdirSync(MIGRATIONS).find((name) => name.endsWith('_document_step_30_private_bucket'));
  const sql = (): string => {
    if (folder === undefined) throw new Error('no *_document_step_30_private_bucket migration in prisma/migrations');
    return readFileSync(join(MIGRATIONS, folder, 'migration.sql'), 'utf8');
  };

  it('is the APPROVED text, byte for byte — R76-bucket-migration-proposal.sql, sha256 491042fa…ad91', () => {
    expect(createHash('sha256').update(sql()).digest('hex')).toBe('491042faf21ac9a061ced896c1c02b03067d03177e1e88db7a343c319855ad91');
  });

  it('its file_size_limit IS TOO_LARGE_BYTES — read from the INSERT, so the storage refuses what the door refuses', () => {
    const insert = /INSERT INTO storage\.buckets \(id, name, public, file_size_limit\)\s+VALUES \('documents', 'documents', (true|false), (\d+)\)/.exec(sql());
    expect(insert?.[1]).toBe('false');
    expect(Number(insert?.[2])).toBe(TOO_LARGE_BYTES);
  });
});
