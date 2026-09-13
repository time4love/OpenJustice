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
    //
    // SPLIT FROM THE JSDOM CHECK BELOW, 2026-08-31, and narrowed rather than
    // loosened. This assertion matched `new JSDOM(` too, using the parser as a
    // proxy for the extractor. They are not the same thing: READABILITY decides
    // what "the article" is, and a second one is a second identity; JSDOM only
    // parses markup. Level 4's chrome ruleset needs a parser to honour a
    // selector — a regex over markup cannot — and produces no competing notion
    // of the article, because the text is still derived by the one
    // `deriveTextFromHtml`. The parser allowance is now its own, explicit list.
    const offenders = files
      .filter((f) => /new Readability\(/.test(readFileSync(f, 'utf8')))
      .map(rel);

    expect(offenders).toEqual(['lib/archiveText.ts']);
  });

  it('every file that parses HTML is on this list, and a third one needs a reason', () => {
    // The other half of the guard above. Constructing a DOM is not by itself a
    // second extraction, but it is how one would arrive unnoticed — so the set
    // of files allowed to do it is enumerated rather than bounded by a rule.
    //
    //   lib/archiveText.ts     — Readability's article, `fullText`
    //   lib/chromeRulesetApply.ts — Level 4's view: removes marked furniture
    //                            from the HTML before the ONE text derivation
    //                            runs. NOT `chromeRuleset.ts`, which holds a
    //                            ruleset's identity and is deliberately
    //                            parser-free so naming a view costs no jsdom.
    //
    // Adding a third means answering which of those two it is. If it is neither,
    // it is probably a second extraction wearing a parser's clothes.
    const parsers = files.filter((f) => /new JSDOM\(/.test(readFileSync(f, 'utf8'))).map(rel);

    expect(parsers.sort()).toEqual(['lib/archiveText.ts', 'lib/chromeRulesetApply.ts']);
  });


  // THE URL+TEXT GROUP WENT AT EVIDENCE STEP 11a, WITH ITS DECOY CASE.
  // It held that `url + "\n\n" + text.slice(0, 40000)` was computed in one place,
  // and excused ONE inline copy in `create_evidence_from_text` on the ground that
  // the mode was under review. Both are gone: document flows §9 retires the tool
  // and replaces it with `add_document`, whose identity is `sha256(bytes)` — one
  // file, one document, no url in the name and no character bound to disagree
  // about. The formula has no second spelling because it has no first one.
  //
  // THE DECOY CASE GOES WITH IT AND MUST: it read the allowed copy to prove the
  // regex still matched something. With the copy deleted it would assert a
  // pattern against a file that does not exist — a guard that cannot fail,
  // which is the thing it was written to prevent.
  //
  // The Readability group above is KEEP and is untouched.
});