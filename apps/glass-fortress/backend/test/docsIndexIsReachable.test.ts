import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// EVERY DOCUMENT IS REACHABLE FROM THE INDEX, AND THE ARCHIVE SAYS WHERE ITS
// SUBJECTS LIVE NOW.
//
// WHY THIS EXISTS. On 2026-09-04 the docs folder held 54 markdown files; eight
// were reachable from nothing a session reads and sixteen from exactly one
// place. Four target designs had landed and each superseded parts of the
// mid-August plans that still sat beside them with no banner — so a session
// that opened the wrong one acted on a retired design. "A copy is what drifts"
// applied to the folder itself. The answer was `docs/README.md`, an index that
// carries pointers and never content, plus a banner on everything retired and
// an archive for what points at nothing current. This scan is what keeps that
// true after the session that built it is gone.
//
// THE RULE SPLITS AT THE ARCHIVE BOUNDARY. Outside `docs/archive/`, a file is
// reachable iff the index links it by name. Inside, the index names the
// directory once, and each file's banner does the pointing: its first line
// carries SUPERSEDED or ARCHIVED and either a repo path that exists or the
// literal "no successor — completed|abandoned|removed <date>". Nothing else
// passes. And no file outside the archive may wear an ARCHIVED banner — a
// document that says it is archived and is not has been half-moved.
//
// WHY NOT ONE CONVENTION MORE. `findingsDocsAreReachable.test.ts` already holds
// that a dated findings doc is named in the STATUS line of every level it bears
// on. That is reachability from the PLAN; this is reachability from the INDEX.
// They share a shape and check different edges, and neither is loosened here.
//
// OBSERVED RED BEFORE GREEN, 2026-09-04. With the index line for
// `gf-researcher-day.md` removed, the first case failed naming exactly that
// file and no other; restored, all cases passed. The failure text is what a
// session will read, so it says what to do, not only what is wrong.
//
// THE VACUITY GUARD IS NOT OPTIONAL. An empty scan reporting success is the
// defect this repository has found more than once; the last case asserts the
// scan examined documents, archived documents, and links.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..', '..', '..');
const DOCS = join(REPO, 'docs');
const ARCHIVE = join(DOCS, 'archive');
const INDEX = join(DOCS, 'README.md');

const MARKDOWN_LINK = /\]\(([^)\s]+\.md)\)/g;
const BACKTICKED = /`([^`]+)`/g;
const NO_SUCCESSOR = /no successor — (completed|abandoned|removed) \d{4}-\d{2}-\d{2}/;
const ARCHIVED_BANNER = /^> \*\*ARCHIVED /;
const BANNER_CLASS = /SUPERSEDED|ARCHIVED/;

/** Every markdown file under `dir`, recursively, as paths relative to `docs/`. */
function markdownUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdownUnder(full);
    return entry.endsWith('.md') ? [relative(DOCS, full)] : [];
  });
}

/** The first line of the first blockquote in a file — the banner, if there is one. */
function bannerFirstLine(file: string): string | null {
  return (
    readFileSync(join(DOCS, file), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('> ')) ?? null
  );
}

/** Backticked tokens on a line that name a file that exists in the repository. */
function existingRepoPaths(line: string): string[] {
  return [...line.matchAll(BACKTICKED)]
    .map((m) => m[1] ?? '')
    .filter((token) => token !== '' && existsSync(join(REPO, token)));
}

const index = readFileSync(INDEX, 'utf8');
const indexLinks = [...index.matchAll(MARKDOWN_LINK)].map((m) => m[1] ?? '');
const everyDoc = markdownUnder(DOCS).filter((f) => f !== 'README.md');
const archived = everyDoc.filter((f) => f.startsWith('archive/'));
const indexed = everyDoc.filter((f) => !f.startsWith('archive/'));

describe('docs/README.md reaches every document, and the archive says where its subjects live now', () => {
  it('every document outside the archive is linked from the index by name, and the archive is named once', () => {
    const unlinked = indexed
      .filter((file) => !indexLinks.includes(file))
      .map(
        (file) =>
          `docs/${file} is not linked from docs/README.md. Add a line under its section — ` +
          `or, if it is the authority on nothing, give it a banner and move it to docs/archive/.`,
      );
    expect(unlinked).toEqual([]);
    expect(index).toContain('`archive/`');
  });

  it('every link in the index resolves to a file that exists', () => {
    const dangling = indexLinks
      .filter((target) => !existsSync(join(DOCS, target)))
      .map((target) => `docs/README.md links ${target}, which does not exist. Fix the path or remove the line.`);
    expect(dangling).toEqual([]);
  });

  it("every archived document's banner names where its subject lives now, or that it has no successor", () => {
    const wrong = archived.flatMap((file) => {
      const line = bannerFirstLine(file);
      if (line === null) return [`docs/${file} has no banner. An archived document opens with one blockquote naming its successor.`];
      if (!BANNER_CLASS.test(line)) return [`docs/${file}: the banner's first line must say SUPERSEDED or ARCHIVED. It says: ${line}`];
      if (existingRepoPaths(line).length === 0 && !NO_SUCCESSOR.test(line)) {
        return [
          `docs/${file}: the banner's first line must name an existing repo path in backticks, ` +
            `or read "no successor — completed|abandoned|removed <date>". It says: ${line}`,
        ];
      }
      return [];
    });
    expect(wrong).toEqual([]);
  });

  it('no document outside the archive carries an ARCHIVED banner', () => {
    const halfMoved = indexed
      .filter((file) =>
        readFileSync(join(DOCS, file), 'utf8')
          .split('\n')
          .some((line) => ARCHIVED_BANNER.test(line)),
      )
      .map((file) => `docs/${file} says it is ARCHIVED but is not under docs/archive/. Move it, or change the banner.`);
    expect(halfMoved).toEqual([]);
  });

  it('examined something — an empty scan is not a pass', () => {
    expect(indexed.length).toBeGreaterThan(0);
    expect(archived.length).toBeGreaterThan(0);
    expect(indexLinks.length).toBeGreaterThan(0);
  });
});
