import { declarationsOf, requireSubjects } from './scan';

// ---------------------------------------------------------------------------
// palette-is-the-system — THE TOKEN BLOCK HOLDS §1.8'S VALUES, AND THE VALUES ARE THE ASSERTION.
//
// docs/gf-ui-design-session-2026-09-16.md §1.8 :42 as amended 2026-09-18 (the researcher), against
// claude.ai's own surface as the reference and SAMPLED rather than assumed: its page background reads
// `#FCFCFB` and its `--bg-100` `#F9F9F7`. Paper becomes `#FCFCFB`, sidebar `#F2F1EE`, muted `#4E463F`,
// line `#E6E5E2`. The cream was four to nine times warmer than the reference — red-minus-blue 9 on the
// paper and 15 on the sidebar against 1 — and the SIDEBAR, not the centre, was the browniest surface.
//
// WHY THIS IS A CASE AND NOT A COMMIT MESSAGE. `tokens-only` holds that a raw colour lives HERE and
// nowhere else; nothing held WHICH colours. A palette is exactly the shape of change that lands by being
// typed, looks plausible in every screenshot, and is re-warmed six months later by a tidy-up nobody
// reviews. **The values, not the property names** — the lesson `overflow: hidden` cost this step, where a
// case asserting a property was DECLARED stayed green while the value locked 91% of the evidence away.
//
// THE PAPER AND THE MUTED ANSWER DIFFERENT COMPLAINTS, and the amendment measured it rather than assuming:
// every paper between the old value and the new moves the muted's contrast by 0.23, while the muted's own
// change moves it 5.66 -> 9.00 on the paper and 5.23 -> 8.18 on the sidebar. No element FAILED AA before,
// so a fix that lightened the paper alone would have reported a repair over an unchanged reading. The
// floor below is therefore on the MUTED, computed here from the token values, and it is set above the old
// value and below the new so that either token drifting back fails by name.
//
// THE LINE MOVES FOR THIS FILE'S OWN RULE, not for taste: `globals.css` :10, "Four meaning colours and no
// more". A border carries no meaning, so it may not carry a hue that says nothing — and at red-minus-blue
// 21 it was the warmest thing left once the paper went neutral.
// ---------------------------------------------------------------------------

/** The token block's ten colours: the four §1.8 MOVES, then the six it says do not move. */
const MOVED: readonly { token: string; value: string; was: string }[] = [
  { token: '--paper', value: '#FCFCFB', was: '#FAF7F1' },
  { token: '--paper-deep', value: '#F2F1EE', was: '#F3EEE4' },
  { token: '--ink-muted', value: '#4E463F', was: '#6B6157' },
  { token: '--line', value: '#E6E5E2', was: '#E4DCCF' },
];

/** BYTE-IDENTICAL BY THE AMENDMENT'S OWN WORDS: "Ink, surface and the four meaning colours DO NOT MOVE." */
const UNMOVED: readonly { token: string; value: string }[] = [
  { token: '--surface', value: '#FFFFFF' },
  { token: '--ink', value: '#1F1B16' },
  { token: '--olive', value: '#4F6B3A' },
  { token: '--gold', value: '#B08D3B' },
  { token: '--amber', value: '#B7791F' },
  { token: '--seal-red', value: '#A8322A' },
];

const tokens = (): Map<string, string> => declarationsOf(':root');

const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);

/** Red minus blue — the warmth the amendment measured, in the same units it states. */
const warmth = (hex: string): number => channel(hex, 1) - channel(hex, 5);

/** WCAG relative luminance, computed here so no dependency decides what "readable" means. */
function luminance(hex: string): number {
  const linear = [1, 3, 5].map((at) => {
    const value = channel(hex, at) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/** The WCAG contrast ratio between two hexes, to two decimals. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round((((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)) * 100) / 100;
}

/** The value a token must hold, or a named throw — never `undefined` flowing into a ratio. */
function valueOf(declared: Map<string, string>, token: string): string {
  const value = declared.get(token);
  if (value === undefined) throw new Error(`globals.css's :root declares no \`${token}\` — the token block is the one home of a colour`);
  return value;
}

describe('palette-is-the-system · the token block holds §1.8’s values', () => {
  it('the FOUR tokens §1.8 moves hold their new values, by value', () => {
    const declared = tokens();
    requireSubjects('the :root token block', [...declared.keys()]);
    const measured = requireSubjects('the tokens §1.8 moves', MOVED).map(({ token }) => [token, valueOf(declared, token)]);
    expect(Object.fromEntries(measured)).toEqual(Object.fromEntries(MOVED.map(({ token, value }) => [token, value])));
  });

  it('EVERYTHING ELSE IS BYTE-IDENTICAL — ink, surface and the four meaning colours do not move', () => {
    const declared = tokens();
    const measured = requireSubjects('the tokens §1.8 leaves alone', UNMOVED).map(({ token }) => [token, valueOf(declared, token)]);
    expect(Object.fromEntries(measured)).toEqual(Object.fromEntries(UNMOVED.map(({ token, value }) => [token, value])));
  });

  it('NO OLD VALUE SURVIVES ANYWHERE IN THE TOKEN BLOCK — a re-warm cannot hide in a second declaration', () => {
    const declared = tokens();
    const held = [...declared.values()].map((value) => value.toUpperCase());
    expect(MOVED.filter(({ was }) => held.includes(was.toUpperCase())).map(({ token }) => token)).toEqual([]);
  });
});

describe('palette-is-the-system · the contrast floor, computed here', () => {
  it('--ink-muted clears AAA on BOTH surfaces — the 12–14px text the muted actually carries', () => {
    const declared = tokens();
    const muted = valueOf(declared, '--ink-muted');
    const measured = {
      onPaper: contrast(muted, valueOf(declared, '--paper')),
      onSidebar: contrast(muted, valueOf(declared, '--paper-deep')),
    };
    // 7.0 is AAA for normal text. The floor sits ABOVE the old muted's 5.66 and BELOW the new 9.00, so
    // restoring EITHER token — the muted itself, or the paper under it — fails here by name.
    expect([measured.onPaper >= 7.0, measured.onSidebar >= 7.0, measured]).toEqual([true, true, measured]);
    expect(measured.onPaper).toBeGreaterThanOrEqual(8.9);
    expect(measured.onSidebar).toBeGreaterThanOrEqual(8.1);
  });

  it('THE FOUR MEANING COLOURS STILL CARRY ON THE NEW PAPER — the amendment’s own four figures', () => {
    const declared = tokens();
    const paper = valueOf(declared, '--paper');
    const measured = Object.fromEntries(
      requireSubjects('the four meaning colours', ['--olive', '--gold', '--amber', '--seal-red']).map((token) => [
        token,
        contrast(valueOf(declared, token), paper),
      ]),
    );
    expect(measured).toEqual({ '--olive': 5.85, '--gold': 3.04, '--amber': 3.55, '--seal-red': 6.48 });
  });

  it('THE WARMTH IS GONE, in the units §1.8 measured it in — red minus blue', () => {
    const declared = tokens();
    const measured = {
      paper: warmth(valueOf(declared, '--paper')),
      sidebar: warmth(valueOf(declared, '--paper-deep')),
      line: warmth(valueOf(declared, '--line')),
    };
    // The reference is claude.ai's own surface at 1. The old values were 9, 15 and 21 — the LINE the
    // warmest thing on screen once the paper went neutral, which is why it is in this change and not
    // deferred as cosmetic.
    expect([measured.paper <= 2, measured.sidebar <= 5, measured.line <= 5, measured]).toEqual([true, true, true, measured]);
  });
});
