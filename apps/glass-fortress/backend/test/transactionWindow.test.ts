import { relative } from 'node:path';
import { SRC, codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// EVERY interactive transaction in src/ carries the shared window, `WRITE_TRANSACTION` (#453).
//
// Prisma's interactive transaction times out at 5 s by default, and a suite that mocks Prisma cannot see it
// (memory: the transaction window). The rule already had three scans — the walk's tools, the debate services
// (`evidence/scans.test.ts`) and the thesis modules (`thesisGuards.test.ts`) — each an ENUMERATION of files, and
// Level 6's trajectory writer sat in none of them with a bare `$transaction`. A list of files is exactly the shape
// that misses the next module, so this scan reads EVERY file under src/ and names only its exceptions.
//
// Counted per file: the transactions opened must equal the transactions windowed. Code only — a comment naming
// `prisma.$transaction(` is not a call.
// ---------------------------------------------------------------------------

/** The one transaction that is NOT a write, each with its reason. A stale exemption fails below. */
const EXEMPT: Readonly<Record<string, string>> = {
  // The destructive-statement simulator: its transaction exists to MEASURE a statement and roll it back, never to
  // commit, and a timeout there surfaces as a `failed` simulation rather than as a silent partial write.
  'services/dbSimulation.ts': 'measures and rolls back; commits nothing',
};

const opened = (code: string): number => (code.match(/\$transaction\s*\(/g) ?? []).length;
const windowed = (code: string): number => (code.match(/,\s*WRITE_TRANSACTION\s*\)/g) ?? []).length;

const modules = tsFiles(SRC).map((file) => ({ file: relative(SRC, file), code: readCode(file) }));

describe('every $transaction in src/ carries WRITE_TRANSACTION', () => {
  it('no module opens a transaction without the window', () => {
    const bare = modules
      .filter(({ file }) => !(file in EXEMPT))
      .filter(({ code }) => opened(code) !== windowed(code))
      .map(({ file, code }) => ({ file, opened: opened(code), windowed: windowed(code) }));
    expect(bare).toEqual([]);
  });

  it('every exemption still opens a transaction — a stale exemption is a hole kept open by name', () => {
    const stale = Object.keys(EXEMPT).filter((file) => opened(modules.find((m) => m.file === file)?.code ?? '') === 0);
    expect(stale).toEqual([]);
  });

  it('finds transactions at all — a silent zero would make it vacuous', () => {
    const total = modules.reduce((n, { code }) => n + opened(code), 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it('DETECTS a bare transaction — and a windowed one and a comment naming one do not fire', () => {
    const bare = 'return prisma.$transaction(async (tx) => {\n  await tx.a.create({});\n});';
    const good = 'return prisma.$transaction(async (tx) => {\n  await tx.a.create({});\n}, WRITE_TRANSACTION);';
    const comment = codeOf('// two `prisma.$transaction(` sites would be two spellings\nconst a = 1;');
    expect([opened(bare) === windowed(bare), opened(good) === windowed(good), opened(comment)]).toEqual([false, true, 0]);
  });
});
