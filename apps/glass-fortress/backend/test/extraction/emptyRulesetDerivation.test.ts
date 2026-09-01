import { deriveText } from '../../src/lib/captureDocument';
import { deriveTextUnderRuleset } from '../../src/lib/chromeRulesetApply';

// ---------------------------------------------------------------------------
// THE EQUIVALENCE `recordCapture` DEPENDS ON.
//
// Recording a capture takes the ruleset-free path when a URL has no rules, so
// that the parser is never loaded for the common case. That is two call sites
// for one decision — the shape this repository names as its dominant defect —
// and it is only safe while the two produce the SAME derivation.
//
// If this fails, `recordCapture` is silently deriving uncalibrated captures
// differently from calibrated ones, and the novelty key moves with it.
// ---------------------------------------------------------------------------
describe('an empty ruleset derives exactly what no ruleset does', () => {
  const CT = 'text/html; charset=utf-8';
  const DOC = Buffer.from(
    '<html><body><nav>home sport</nav><p>the article</p><footer>©</footer></body></html>',
    'utf8',
  );

  it('agrees on the text, the hash, and the extraction version', () => {
    const plain = deriveText(DOC, CT);
    const empty = deriveTextUnderRuleset(DOC, CT, null, { selectors: [] });
    expect(empty.text).toBe(plain.text);
    expect(empty.textHash).toBe(plain.textHash);
    expect(empty.textExtractionVersion).toBe(plain.textExtractionVersion);
  });

  it('and a NON-empty ruleset does not — so the case above is not vacuous', () => {
    const plain = deriveText(DOC, CT);
    const filtered = deriveTextUnderRuleset(DOC, CT, null, { selectors: ['nav'] });
    expect(filtered.text).not.toBe(plain.text);
    expect(filtered.textExtractionVersion).not.toBe(plain.textExtractionVersion);
  });
});
