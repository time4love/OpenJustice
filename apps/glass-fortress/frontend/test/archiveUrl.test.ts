import { archiveUrl } from '@/lib/archiveUrl';
import { INVESTIGATIVE_CATEGORIES } from '@/types/corpus';
import { INVESTIGATIVE_CATEGORIES as LANDED_CATEGORIES } from '@/lib/investigativeCategories';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRONTEND, importsOf, requireSubjects } from './scan';
import { captureRow } from './fixtures/corpus/capture';
import { corpusStream } from './fixtures/corpus/stream';

// ---------------------------------------------------------------------------
// archive-url + the corpus types' one guard — docs/gf-evidence-flows.md §5 :428–:430;
// docs/gf-ui-flows.md §26 :716–:718.
//
// THE SECOND WITNESS IS COMPOSED, NEVER FETCHED, and that is the property worth holding: the link's whole
// value is that this platform does not stand between the reader and the archive. A composed link is
// checkable against the appendix with no network and no recorded response.
// ---------------------------------------------------------------------------

/** Every way a module could reach the network — the subject of the purity half of the case below. */
const NETWORK_WORDS = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'axios'];

describe('archive-url', () => {
  it('THE LINK IS THE COMPOSED FORM, by value, over the fixture the appendix specifies', () => {
    expect(archiveUrl(captureRow.page.url, captureRow.capture)).toBe('https://web.archive.org/web/20211223211940/https://example.gov/one/');
  });

  it('EVERY CAPTURE IN THE STREAM COMPOSES, and the subject set is not empty', () => {
    // A FLOOR, not just "no throw": a scan that examined zero captures would pass silently, and this file's
    // own fixture is the only thing standing in for a corpus here.
    const captures = requireSubjects(
      'capture rows of the stream fixture',
      corpusStream.entries.filter((entry) => entry.kind === 'CAPTURE'),
    );
    const composed = captures.map((entry) => archiveUrl(entry.page.url, entry.capture));
    expect({ count: composed.length, composed }).toEqual({
      count: 2,
      composed: [
        'https://web.archive.org/web/20211223211940/https://example.gov/one/',
        'https://web.archive.org/web/20220105090000/https://example.gov/one/',
      ],
    });
  });

  it('A TRANSPOSED CALL THROWS RATHER THAN COMPOSING A LINK THAT GOES NOWHERE', () => {
    // The decoy this case exists for is `archiveUrl(timestamp, url)` — the two arguments are both strings,
    // so nothing but a guard catches the swap. A second witness at a wrong address reads to a checker as
    // the PLATFORM's word rather than the archive's, which is the one thing §5 :428–:430 forbids.
    // The transposed call is caught by the TIMESTAMP guard, not the url one, because the url arrives where
    // the timestamp belongs and fails first. The message names the value it actually received, which is what
    // makes the swap readable from the failure rather than only from the stack.
    expect(() => archiveUrl(captureRow.capture, captureRow.page.url)).toThrow(
      'archiveUrl: `https://example.gov/one/` is not a 14-digit wayback timestamp',
    );
    expect(() => archiveUrl(captureRow.page.url, '2021-12-23')).toThrow('is not a 14-digit wayback timestamp');
    expect(() => archiveUrl(captureRow.page.url, '202112232119401')).toThrow('is not a 14-digit wayback timestamp');
    expect(() => archiveUrl('example.gov/one/', captureRow.capture)).toThrow('is not an absolute url');
  });

  it('NOTHING IS FETCHED, AND THE MODULE IS PURE — held on the SOURCE, because jsdom has no `fetch` to spy on', () => {
    // A spy was the first attempt and it cannot work: `globalThis.fetch` does not exist in this environment,
    // so `jest.spyOn` throws before the function is ever called — a case that would have been red for a
    // reason that has nothing to do with the property. The SOURCE is where "composed, never fetched" is
    // actually observable, and it is the stronger statement: it holds for every future caller rather than
    // for the one path a spy happened to exercise. It is also `a pure module never gains a dependency`.
    const file = join(FRONTEND, 'src/lib/archiveUrl.ts');
    const reaches = (path: string): string[] => NETWORK_WORDS.filter((word) => readFileSync(path, 'utf8').includes(word));
    expect({
      imports: importsOf(file).map(({ specifier }) => specifier),
      network: reaches(file),
      // The control, in the same `expect`: the reader must FIND a network call where one genuinely is, or
      // an empty list above proves only that the scanner is blind. `lib/api.ts` is the module that fetches.
      controlFindsNetwork: reaches(join(FRONTEND, 'src/lib/api.ts')).length > 0,
    }).toEqual({ imports: [], network: [], controlFindsNetwork: true });
  });
});

describe('corpus-categories-are-the-landed-seven', () => {
  it('THE CORPUS TYPE AND THE RETIRING MODULE HOLD THE SAME SEVEN — delete this case with the module, not before', () => {
    // `types/corpus.ts` declares the seven rather than importing them, because the module that holds them
    // today is REPLACED by UI-7 and retired at UI-10 (plan :660, :883) and a corpus body's enum may not
    // depend on a module on its way out. Until it goes, the two lists are one rule with two spellings, and
    // this case is what stops them drifting. It is the only place the two are named together.
    expect([...INVESTIGATIVE_CATEGORIES].sort()).toEqual([...LANDED_CATEGORIES].sort());
    expect(requireSubjects('the investigative categories', INVESTIGATIVE_CATEGORIES)).toHaveLength(7);
  });
});
