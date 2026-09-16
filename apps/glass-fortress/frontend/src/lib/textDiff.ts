// ---------------------------------------------------------------------------
// THE ONE COMPUTATION THE FRONTEND OWNS — docs/gf-thesis-flows.md T6 :898–:901 ("the text diff, computed by the
// frontend from two immutable texts, and every citation whose pin moved"); docs/gf-ui-flows.md §8 :331–:333,
// §16 :513–:515, §18 :583–:586.
//
// PURE, AND OVER EXACTLY TWO TEXTS. No I/O, no clock, no locale: the same two texts give the same runs, which is
// what lets a reader compare two published versions and get the same answer the next reader gets.
//
// THE UNIT IS A WORD WITH ITS TRAILING SPACES, a run of newlines, or A WHOLE CITATION TOKEN. A character diff
// would tear `#ev_0x…` into fragments of a hash, which is exactly the noise §4 :167–:170 keeps off the page; a
// line diff would report a whole paragraph changed for one word.
// ---------------------------------------------------------------------------

export interface DiffRun {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

export interface CitationRef {
  kind: string;
  name: string;
  pin: string | null;
}

export interface MovedPin {
  kind: string;
  name: string;
  from: string | null;
  to: string | null;
}

/** A citation token, a word with its trailing spaces, a run of newlines, or a run of spaces — in that order. */
const UNIT = /#(?:ev|tr|doc)_\S+[ \t]*|\S+[ \t]*|\n+|[ \t]+/g;

function unitsOf(text: string): string[] {
  return text.match(UNIT) ?? [];
}

interface Step {
  kind: DiffRun['kind'];
  text: string;
}

/** Myers' shortest edit script (O(ND)), with the trace kept so the script itself can be read back. */
function script(before: readonly string[], after: readonly string[]): Step[] {
  const max = before.length + after.length;
  const trace: Map<number, number>[] = [];
  const reach = new Map<number, number>([[1, 0]]);
  const at = (map: Map<number, number>, k: number): number => map.get(k) ?? 0;

  for (let d = 0; d <= max; d += 1) {
    trace.push(new Map(reach));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && at(reach, k - 1) < at(reach, k + 1));
      let x = down ? at(reach, k + 1) : at(reach, k - 1) + 1;
      let y = x - k;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x += 1;
        y += 1;
      }
      reach.set(k, x);
      if (x >= before.length && y >= after.length) return backtrack(trace, before, after);
    }
  }
  throw new Error('textDiff: no edit script within the bound — unreachable for two finite texts');
}

function backtrack(trace: readonly Map<number, number>[], before: readonly string[], after: readonly string[]): Step[] {
  const steps: Step[] = [];
  let x = before.length;
  let y = after.length;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const reach = trace[d];
    if (reach === undefined) break;
    const k = x - y;
    const at = (key: number): number | undefined => reach.get(key);
    const down = k === -d || (k !== d && (at(k - 1) ?? -1) < (at(k + 1) ?? -1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK) ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      steps.push({ kind: 'same', text: before[x] ?? '' });
    }
    if (d > 0) {
      if (x === previousX) {
        y -= 1;
        steps.push({ kind: 'added', text: after[y] ?? '' });
      } else {
        x -= 1;
        steps.push({ kind: 'removed', text: before[x] ?? '' });
      }
    }
  }
  return steps.reverse();
}

/** Adjacent steps of one kind become one run; a removal always precedes the addition it stands beside. */
function runsOf(steps: readonly Step[]): DiffRun[] {
  const runs: DiffRun[] = [];
  for (const step of steps) {
    const last = runs.at(-1);
    if (last !== undefined && last.kind === step.kind) {
      last.text += step.text;
      continue;
    }
    // A replacement reads as "what was there, then what is there now" — never the other way round.
    if (last !== undefined && last.kind === 'added' && step.kind === 'removed') {
      runs[runs.length - 1] = { kind: 'removed', text: step.text };
      runs.push(last);
      continue;
    }
    runs.push({ kind: step.kind, text: step.text });
  }
  return runs.filter((run) => run.text !== '');
}

/**
 * The diff between two published versions' texts, as runs in document order.
 * INVARIANT, held by `test/textDiff.test.ts`: `same + removed` rejoins `before`, `same + added` rejoins `after`.
 */
export function textDiff(before: string, after: string): DiffRun[] {
  if (before === after) return before === '' ? [] : [{ kind: 'same', text: before }];
  return runsOf(script(unitsOf(before), unitsOf(after)));
}

/**
 * Every citation BOTH versions carry whose pinned content version differs, in the newer version's order
 * (T6 :900–:901). A citation only one version carries is not "moved" — the text diff already shows it.
 */
export function movedPins(before: readonly CitationRef[], after: readonly CitationRef[]): MovedPin[] {
  const was = new Map(before.map((citation) => [`${citation.kind}:${citation.name}`, citation.pin]));
  return after.flatMap((citation) => {
    const key = `${citation.kind}:${citation.name}`;
    if (!was.has(key)) return [];
    const from = was.get(key) ?? null;
    return from === citation.pin ? [] : [{ kind: citation.kind, name: citation.name, from, to: citation.pin }];
  });
}
