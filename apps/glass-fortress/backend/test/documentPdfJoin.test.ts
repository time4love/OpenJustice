import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { CURRENT_EXTRACTOR, PDF_JOIN_GAP_EM, joinPdfText, type PdfTextRun } from '../src/lib/documentExtractor';

// ---------------------------------------------------------------------------
// THE PDF JOIN — `docs/gf-document-hebrew-text-layer-2026-09-24.md` §5 ruling 3 (:126–:129), §2b (:57–:88).
//
// "The PDF join at `documentExtractor.ts:225` is a defect, fixed by a geometry join at a new `CURRENT_EXTRACTOR` that
// names the join policy and its threshold, the threshold read off the measured valley." Today's join put a space between
// EVERY two pdf.js items, so a word its producer drew as two runs read as two words (§2 :50–:55).
//
// THE JOIN IS PURE AND NEVER IMPORTS pdfjs, which is why these cases run in jest at all: `pdfjs-dist` is ESM-only and no
// mechanism loads it here (`documentExtractor.ts`'s header records the three measured failures). The join over REAL
// pdf.js items is held by `test/documentPdfProcess.test.ts`, in a child `node` over `dist/`.
//
// THE ITEM DOUBLES ANSWER WHAT pdf.js 6.3.289 ANSWERS, read from its source (`pdf.worker.mjs`): a run is `{ str,
// transform: [a, b, c, d, x, y], width, hasEOL }`; `appendEOL` either sets `hasEOL` on the item before a break or, when
// no item is open, pushes an EMPTY item `{ str: '', width: 0, hasEOL: true }`; `pushWhitespace` pushes an item whose
// `str` is `' '`. The process test asserts the real items carry these four fields.
// ---------------------------------------------------------------------------

const SIZE = 12;
const BASELINE = 720;

interface RunOptions {
  y?: number;
  size?: number;
  /** transform[0] — a horizontal scale that differs from the font size, as `Tz` produces. */
  scaleX?: number;
  hasEOL?: boolean;
}

function run(str: string, x: number, width: number, options: RunOptions = {}): PdfTextRun {
  const size = options.size ?? SIZE;
  return {
    str,
    transform: [options.scaleX ?? size, 0, 0, size, x, options.y ?? BASELINE],
    width,
    hasEOL: options.hasEOL ?? false,
  };
}

/** The run drawn `gapEm` font sizes to the RIGHT of `previous`'s right edge — a left-to-right advance. */
function rightOf(previous: PdfTextRun, gapEm: number, str: string, width: number, options: RunOptions = {}): PdfTextRun {
  const x = (previous.transform.at(4) ?? Number.NaN) + previous.width + gapEm * (options.size ?? SIZE);
  return run(str, x, width, options);
}

/** The run drawn `gapEm` font sizes to the LEFT of `previous`'s left edge — a right-to-left advance, as Hebrew runs. */
function leftOf(previous: PdfTextRun, gapEm: number, str: string, width: number): PdfTextRun {
  const x = (previous.transform.at(4) ?? Number.NaN) - gapEm * SIZE - width;
  return run(str, x, width);
}

/** pdf.js's empty end-of-line item (`appendEOL` with no item open). */
function emptyEndOfLine(x: number, y: number = BASELINE): PdfTextRun {
  return { str: '', transform: [SIZE, 0, 0, SIZE, x, y], width: 0, hasEOL: true };
}

describe('the geometry join — a space only where the gap between two runs is a word gap', () => {
  it('a word drawn as TWO runs at gap 0 reads WHOLE', () => {
    const first = run('Adv', 72, 22);
    expect(joinPdfText([first, rightOf(first, 0, 'erse', 26)])).toBe('Adverse');
  });

  it('a split at 0.047 em — the measured ceiling of split pieces (§2b :70) — reads whole', () => {
    const first = run('rep', 72, 20);
    expect(joinPdfText([first, rightOf(first, 0.047, 'orted', 30)])).toBe('reported');
  });

  it('a bullet at 0.077 em — the measured floor of bullet dots (§2b :79) — takes ONE space', () => {
    const first = run('-', 72, 4);
    expect(joinPdfText([first, rightOf(first, 0.077, 'the', 18)])).toBe('- the');
  });

  it('a real word gap (0.25 em) takes ONE space', () => {
    const first = run('adverse', 72, 40);
    expect(joinPdfText([first, rightOf(first, 0.25, 'events', 34)])).toBe('adverse events');
  });

  it('RIGHT TO LEFT: a Hebrew run drawn to the LEFT of the one before it is measured from its right edge', () => {
    // The producer of MK 05/2023 draws a right-to-left line run by run leftward, in logical order (§2 :50–:55).
    const first = run('באח', 400, 20);
    expect(joinPdfText([first, leftOf(first, 0, 'ד', 6)])).toBe('באחד');
    expect(joinPdfText([first, leftOf(first, 0.25, 'עם', 14)])).toBe('באח עם');
  });

  it('the threshold IS PDF_JOIN_GAP_EM — a gap just above it spaces, just below it joins', () => {
    const first = run('a', 72, 6);
    const epsilon = 1e-6;
    expect(joinPdfText([first, rightOf(first, PDF_JOIN_GAP_EM + epsilon, 'b', 6)])).toBe('a b');
    expect(joinPdfText([first, rightOf(first, PDF_JOIN_GAP_EM - epsilon, 'b', 6)])).toBe('ab');
  });

  it('the font size is the VERTICAL scale, hypot(c, d) — a horizontally scaled run does not move the threshold', () => {
    // 0.5 units over a size of 12 is 0.042 em (joined); over transform[0] = 6 it would be 0.083 em (spaced).
    const first = run('Adv', 72, 22, { scaleX: 6 });
    const second = run('erse', 72 + 22 + 0.5, 26, { scaleX: 6 });
    expect(joinPdfText([first, second])).toBe('Adverse');
  });

  it('the font size is the LATER run’s — two runs of different sizes are measured against the second', () => {
    // A gap of 1 unit: 0.083 em of a 12-unit run (a space), 0.042 em of a 24-unit run (none). Each direction once, so
    // measuring against the EARLIER run's size, or the larger of the two, reddens.
    const large = run('Big', 72, 40, { size: 24 });
    expect(joinPdfText([large, run('small', 72 + 40 + 1, 30, { size: 12 })])).toBe('Big small');
    const small = run('small', 72, 30, { size: 12 });
    expect(joinPdfText([small, run('Big', 72 + 30 + 1, 40, { size: 24 })])).toBe('smallBig');
  });

  it('a degenerate ZERO-size run: a space exactly when the gap is positive, never NaN', () => {
    const first = run('a', 72, 6, { size: 0 });
    expect(joinPdfText([first, run('b', 78, 6, { size: 0 })])).toBe('ab');
    expect(joinPdfText([first, run('b', 79, 6, { size: 0 })])).toBe('a b');
  });
});

describe('the line rule — a new line where the baseline moves OR at pdf.js’s end-of-line mark', () => {
  it('a BASELINE MOVE starts a new line, whatever the horizontal gap', () => {
    // The next line starts at the left margin: measured as a horizontal gap, the two boxes overlap and would GLUE.
    const first = run('open', 300, 24);
    expect(joinPdfText([first, run('throughout', 280, 60, { y: BASELINE - 16 })])).toBe('open\nthroughout');
  });

  it('a mark with no move — an EMPTY hasEOL item between two runs — starts a new line', () => {
    const first = run('cell', 72, 20);
    expect(joinPdfText([first, emptyEndOfLine(92), rightOf(first, 0, 'next', 20)])).toBe('cell\nnext');
  });

  it('a mark with no move — hasEOL on the run BEFORE the break — starts a new line', () => {
    const first = run('cell', 72, 20, { hasEOL: true });
    expect(joinPdfText([first, rightOf(first, 0, 'next', 20)])).toBe('cell\nnext');
  });

  it('a trailing space on the run before a break is KEPT — an item’s text is never edited', () => {
    const first = run('word ', 72, 28);
    expect(joinPdfText([first, run('next', 72, 22, { y: BASELINE - 16 })])).toBe('word \nnext');
  });

  it('a mark at the END of a page writes nothing after the last run', () => {
    const first = run('last', 72, 20, { hasEOL: true });
    expect(joinPdfText([first, emptyEndOfLine(92)])).toBe('last');
  });
});

describe('what the join never does', () => {
  it('a NEGATIVE gap (a visual-order run, §2b :82–:85) takes no space and is NEVER reordered', () => {
    // "10 mIU/ml" drawn in visual order inside a Hebrew line: the second run overlaps the first. Content-stream order
    // stands — the residual the extractor ruling accepted without a reordering heuristic (§6.5 :184–:189).
    const first = run('mIU/ml', 100, 36);
    expect(joinPdfText([first, run('10', 120, 12)])).toBe('mIU/ml10');
  });

  it('a pdf.js WHITESPACE run is emitted once, and no second space is added beside it', () => {
    const first = run('a', 72, 6);
    const space = rightOf(first, 0.3, ' ', 3);
    expect(joinPdfText([first, space, rightOf(space, 0.3, 'b', 6)])).toBe('a b');
  });

  it('a run that already ENDS or BEGINS with a space takes no second one', () => {
    const first = run('a ', 72, 9);
    expect(joinPdfText([first, rightOf(first, 0.3, 'b', 6)])).toBe('a b');
    const second = run('a', 72, 6);
    expect(joinPdfText([second, rightOf(second, 0.3, ' b', 9)])).toBe('a b');
  });

  it('an empty page is the empty string', () => {
    expect(joinPdfText([])).toBe('');
  });

  it('a run whose transform is not six numbers is REFUSED LOUDLY — `extract` records it as READ_FAILED', () => {
    const first = run('a', 72, 6);
    expect(() => joinPdfText([first, { str: 'b', transform: [SIZE, 0, 0, SIZE], width: 6, hasEOL: false }])).toThrow(
      /transform/,
    );
  });
});

describe('CURRENT_EXTRACTOR names the join policy and its threshold (ruling 3)', () => {
  it('names `gapjoin<threshold>em` from the constant, as a new extractor — v2, not v1', () => {
    expect(CURRENT_EXTRACTOR).toContain(`-streamorder-gapjoin${String(PDF_JOIN_GAP_EM)}em-`);
    expect(CURRENT_EXTRACTOR.startsWith('v2-')).toBe(true);
  });

  it('the threshold is the value the researcher ruled on 2026-09-25, inside §2b’s band', () => {
    expect(PDF_JOIN_GAP_EM).toBe(0.06);
    expect(PDF_JOIN_GAP_EM).toBeGreaterThanOrEqual(0.05);
    expect(PDF_JOIN_GAP_EM).toBeLessThanOrEqual(0.07);
  });
});

// ---------------------------------------------------------------------------
// THE THRESHOLD IS SPELLED ONCE — a SOURCE SCAN over the file, because no behavioural case can see a re-spelled literal:
// `0.06` written beside the constant behaves identically at ±ε (R83 review Entry 2, the first MEDIUM).
//
// A SYNTAX TREE, NOT A REGEX: the comments name 0.047, 0.077 and the band, and they are not code. The scan FAILS CLOSED —
// a file it cannot find, or a constant it cannot locate, is a failure, never an empty result.
// ---------------------------------------------------------------------------

const SOURCE_PATH = join(__dirname, '..', 'src', 'lib', 'documentExtractor.ts');
const CONSTANT = 'PDF_JOIN_GAP_EM';

interface ThresholdSpellings {
  /** Every non-integer numeric literal in code, with the declaration it initialises (or null). */
  decimals: { value: number; declares: string | null }[];
  /** String and template text in code that spells the threshold's value. */
  spelledInText: string[];
  /** Binary expressions whose two operands are both numeric literals — `6 / 100`. */
  literalArithmetic: number;
  /** The names of the functions and declarations that read the constant. */
  readers: string[];
  /** Every numeric literal inside `joinPdfText`, integers included — the join needs none. */
  inTheJoin: string[];
}

function enclosingName(node: ts.Node): string | null {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name !== undefined) return at.name.text;
    if (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name)) return at.name.text;
  }
  return null;
}

function enclosingFunction(node: ts.Node): string | null {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name !== undefined) return at.name.text;
  }
  return null;
}

function thresholdSpellings(code: string): ThresholdSpellings {
  const source = ts.createSourceFile('documentExtractor.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: ThresholdSpellings = { decimals: [], spelledInText: [], literalArithmetic: 0, readers: [], inTheJoin: [] };
  const spelled = String(PDF_JOIN_GAP_EM);
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node)) {
      if (enclosingFunction(node) === 'joinPdfText') found.inTheJoin.push(node.text);
      const value = Number(node.text);
      if (!Number.isInteger(value)) {
        const declaration = ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : null;
        found.decimals.push({ value, declares: declaration });
      }
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) &&
      node.text.includes(spelled)
    ) {
      found.spelledInText.push(node.text);
    }
    if (ts.isBinaryExpression(node) && ts.isNumericLiteral(node.left) && ts.isNumericLiteral(node.right)) {
      found.literalArithmetic += 1;
    }
    if (ts.isIdentifier(node) && node.text === CONSTANT && !ts.isVariableDeclaration(node.parent)) {
      const reader = enclosingName(node);
      if (reader !== null) found.readers.push(reader);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The scan's verdict: the reasons the file spells the threshold more than once, or reads it nowhere it must. */
function thresholdOffences(code: string): string[] {
  const spellings = thresholdSpellings(code);
  const offences: string[] = [];
  const declared = spellings.decimals.filter((decimal) => decimal.declares === CONSTANT);
  if (declared.length !== 1 || declared.at(0)?.value !== PDF_JOIN_GAP_EM) offences.push(`${CONSTANT} is not declared once`);
  for (const decimal of spellings.decimals) {
    if (decimal.declares !== CONSTANT) offences.push(`a decimal literal ${String(decimal.value)} outside ${CONSTANT}`);
  }
  for (const text of spellings.spelledInText) offences.push(`the value spelled in text: ${text}`);
  if (spellings.literalArithmetic > 0) offences.push(`${String(spellings.literalArithmetic)} literal-arithmetic expression(s)`);
  if (spellings.inTheJoin.length > 0) offences.push(`joinPdfText holds a numeric literal: ${spellings.inTheJoin.join(', ')}`);
  for (const reader of ['joinPdfText', 'CURRENT_EXTRACTOR']) {
    if (!spellings.readers.includes(reader)) offences.push(`${reader} does not read ${CONSTANT}`);
  }
  return offences;
}

describe('the threshold is spelled ONCE — a source scan of documentExtractor.ts', () => {
  const code = readFileSync(SOURCE_PATH, 'utf8');

  it('reads a real subject — the file exists, declares the constant, and the join and the version read it', () => {
    const spellings = thresholdSpellings(code);
    expect(code.length).toBeGreaterThan(1000);
    expect(spellings.decimals.filter((decimal) => decimal.declares === CONSTANT)).toHaveLength(1);
    expect(spellings.readers).toEqual(expect.arrayContaining(['joinPdfText', 'CURRENT_EXTRACTOR']));
    // The join-body rule has a real subject: `joinPdfText` is a function DECLARATION, the node that rule looks for.
    expect(code).toMatch(/function joinPdfText\(/);
  });

  it('holds: one decimal literal in the file, the constant; the value in no string; no literal arithmetic; none in the join', () => {
    expect(thresholdOffences(code)).toEqual([]);
  });

  // THE POSITIVE CONTROLS — the same scan over the real source with the threshold planted in every spelling the language
  // allows. Each plant is asserted to CHANGE the source first, so a replacement that found nothing cannot pass as caught.
  const comparison = `gap > ${CONSTANT} * after.fontSize`;
  const version = `gapjoin\${String(${CONSTANT})}em`;
  it.each([
    ['a decimal literal', comparison, 'gap > 0.06 * after.fontSize'],
    ['an exponent', comparison, 'gap > 6e-2 * after.fontSize'],
    ['a leading dot', comparison, 'gap > .06 * after.fontSize'],
    ['a trailing zero', comparison, 'gap > 0.060 * after.fontSize'],
    ['literal arithmetic', comparison, 'gap > (6 / 100) * after.fontSize'],
    ['the version spelled as text', version, 'gapjoin0.06em'],
  ])('CATCHES the threshold re-spelled as %s', (_spelling, from, to) => {
    // The plant's target occurs EXACTLY ONCE, so it lands on the code line and not in a comment the scan rightly ignores.
    expect(code.split(from)).toHaveLength(2);
    const planted = code.replace(from, to);
    expect(planted).not.toBe(code);
    expect(thresholdOffences(planted)).not.toEqual([]);
  });

  it('CATCHES the threshold as an INTEGER RATIO across the inequality, with the constant still read in the join', () => {
    // R83 review Entry 5's blind spelling: `gap * 50 > 3 * after.fontSize` is the threshold with no decimal in it, and
    // while `joinPdfText` still reads the constant somewhere, every rule above holds. So the join's body holds NO numeric
    // literal at all, integers included — it needs none, and this is the one offence this plant can raise.
    expect(code.split(comparison)).toHaveLength(2);
    const planted = code.replace(comparison, `gap * 50 > 3 * after.fontSize * (${CONSTANT} / ${CONSTANT})`);
    expect(thresholdOffences(planted)).toEqual(['joinPdfText holds a numeric literal: 50, 3']);
  });
});
