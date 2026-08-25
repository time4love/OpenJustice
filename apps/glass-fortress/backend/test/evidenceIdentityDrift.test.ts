import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the two things FINDING 79 turned out to be about.
 *
 * The bug was never really "a view counter". It was that "the article text" and
 * "the evidence hash" each had more than one implementation, so two of them
 * could disagree while both looked correct — and one did, for years, on any
 * document over 40,000 characters.
 *
 * Neither divergence was caught by a test, because every test exercised one
 * path. These scan the source instead, which is the only thing that sees ALL of
 * them at once.
 */

const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const rel = (f: string) => f.slice(SRC.length + 1);

describe('there is one extraction of "the article", and one evidence hash', () => {
  const files = sourceFiles(SRC);

  it('only archiveText.ts constructs Readability', () => {
    // utils/webScraper.ts used to run a second pass returning
    // `article.textContent` — a different string from the one the archive path
    // stores — so the same URL yielded different text via the website and via
    // MCP, and therefore different evidence identities.
    const offenders = files
      .filter((f) => /new Readability\(|new JSDOM\(/.test(readFileSync(f, 'utf8')))
      .map(rel);

    expect(offenders).toEqual(['lib/archiveText.ts']);
  });

  it('the url+text evidence hash is computed only through the shared function', () => {
    // The inline copy in evidenceRoutes.ts omitted the 40,000-character bound
    // that the MCP path applied. Same url, same text, two identities.
    //
    // ALLOWED holds the one remaining copy, with the reason it is still here:
    // create_evidence_from_text relies on a researcher pasting text by hand, the
    // mode is under review (a saved PDF is the likely replacement), and
    // refactoring something that may be deleted is wasted work. Listed rather
    // than pattern-excluded so that decision stays visible in code.
    const ALLOWED = new Set(['mcp/tools/createEvidenceFromText.ts']);

    const inlineHash = /hashFile\(\s*Buffer\.from\(\s*`\$\{[^`]*\}\\n\\n/;
    const offenders = files
      .filter((f) => inlineHash.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !ALLOWED.has(f));

    expect(offenders).toEqual([]);
  });

  it('the guard can actually see an inline copy — it is not a regex that matches nothing', () => {
    // A drift guard that cannot fail is decoration. This asserts the pattern
    // still matches the one known copy the allowlist is excusing.
    const known = readFileSync(join(SRC, 'mcp/tools/createEvidenceFromText.ts'), 'utf8');
    expect(/hashFile\(\s*Buffer\.from\(\s*`\$\{[^`]*\}\\n\\n/.test(known)).toBe(true);
  });
});
