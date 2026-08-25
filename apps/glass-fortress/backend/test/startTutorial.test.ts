import { startTutorialHandler } from '../src/mcp/tools/startTutorial';
import { TUTORIAL_CHAPTERS, COMMON_RULES, findChapter } from '../src/mcp/tutorial/chapters';

// ---------------------------------------------------------------------------
// The curriculum is a string, and a string has no compiler.
//
// Every rule it carries was bought by a real failure in front of a real learner
// — three revisions in one afternoon, none of which was visible from reading the
// chapter. An edit that quietly drops one of them regresses the tutorial to a
// version that has already been observed to fail, and nothing else in this
// codebase would notice.
//
// So this suite does not test that the handler returns a string. It tests that
// the specific lessons survive.
// ---------------------------------------------------------------------------

/**
 * Collapse runs of whitespace so a pattern tests whether a rule is PRESENT, not
 * where the prose happened to wrap.
 *
 * The curriculum is hand-wrapped at 90 columns. Without this, every multi-word
 * assertion below passes on the accident of the current line breaks and fails
 * the next time someone reflows a paragraph — which would train whoever hits it
 * to weaken the assertion rather than look at what broke.
 */
const flat = (s: string): string => s.replace(/\s+/g, ' ');

const RULES = flat(COMMON_RULES);
const CH1 = flat(findChapter(1)?.instructions ?? '');

describe('start_tutorial', () => {
  it('defaults to chapter 1', async () => {
    const withArg = JSON.parse(await startTutorialHandler({ chapter: 1 }));
    const without = JSON.parse(await startTutorialHandler({}));

    expect(without.status).toBe('OK');
    expect(without.chapter).toBe(1);
    expect(without).toEqual(withArg);
  });

  it('serves the chapter as instructions to the assistant, not as learner-facing text', async () => {
    const res = JSON.parse(await startTutorialHandler({}));

    expect(res.instructions.length).toBeGreaterThan(500);
    // The failure this guards: an assistant pasting the curriculum into the
    // conversation instead of acting on it.
    expect(res.howToUse).toMatch(/instructions FOR YOU/i);
    expect(res.howToUse).toMatch(/[Dd]o not paste/);
    expect(res.writesNothing).toBe(true);
  });

  it('refuses to improvise a chapter that does not exist', async () => {
    const res = JSON.parse(await startTutorialHandler({ chapter: 99 }));

    expect(res.status).toBe('CHAPTER_NOT_AVAILABLE');
    expect(res.requested).toBe(99);
    expect(res.available).toEqual([{ number: 1, title: TUTORIAL_CHAPTERS[0]?.title }]);
    // Improvising a syllabus from the tool list is the exact behaviour this tool
    // was built to replace, so the miss path has to say so rather than trail off.
    expect(res.explanation).toMatch(/do not invent|improvised syllabus/i);
  });

  it('reports honestly whether a next chapter exists', async () => {
    const res = JSON.parse(await startTutorialHandler({ chapter: 1 }));
    expect(res.nextChapterAvailable).toBe(TUTORIAL_CHAPTERS.length > 1);
  });

  // -------------------------------------------------------------------------
  // The rules, each tied to the run that produced it.
  // -------------------------------------------------------------------------

  it('carries the anti-contamination rule — the one a fabrication slipped past', () => {
    // An assistant that has read this platform's docs, or merely run other
    // queries earlier in the conversation, will state facts the learner cannot
    // reproduce. During authoring exactly that happened, and the invented detail
    // was fluent enough that only the learner's suspicion caught it — inside a
    // chapter whose subject is not accepting unverifiable claims.
    expect(RULES).toMatch(/THIS conversation/);
    expect(RULES).toMatch(/did not fetch it, you do not know it/i);
    expect(RULES).toMatch(/fabricat/i);
  });

  it('carries the no-syntax rule (rev 1 → 2)', () => {
    expect(RULES).toMatch(/plain language/i);
    expect(RULES).toMatch(/never type a tool name/i);
    expect(RULES).toMatch(/AFTER you used it/);
  });

  it('carries the never-show-a-hash rule and its replacement (rev 2 → 3)', () => {
    expect(RULES).toMatch(/Never show a content hash in a list/i);
    // The fix is not "hide the hash" — it is that the version number does the
    // hash's job for a human, which is what makes a revert visible at a glance.
    expect(RULES).toMatch(/VERSION NUMBER IS THE HUMAN-READABLE HASH/);
  });

  it('carries the provenance rule, and forbids blending judgement with computation', () => {
    expect(RULES).toMatch(/Mark model output/i);
    expect(RULES).toMatch(/never recomputed/i);
    expect(RULES).toMatch(/NEVER blend the two/);
  });

  it('carries the pace rule and forbids withholding (rev 2 → 3)', () => {
    expect(RULES).toMatch(/six exchanges/i);
    expect(RULES).toMatch(/Lead with the finding/i);
    expect(RULES).toMatch(/Never withhold/i);
  });

  it('requires reporting a mismatch rather than bending data to the script', () => {
    // The archive drifts and classifiers are not deterministic, so a run that
    // disagrees with the script is expected. Bending the report to match is the
    // failure mode this platform's own record calls mechanism right, summary
    // wrong.
    expect(RULES).toMatch(/Report the discrepancy/i);
    expect(RULES).toMatch(/Never bend what a tool returned/i);
  });

  it('teaches in Hebrew and reserves English for builder talk', () => {
    expect(RULES).toMatch(/Teach in Hebrew/);
    expect(RULES).toMatch(/talk to a builder/i);
  });

  // -------------------------------------------------------------------------
  // Chapter 1 specifics
  // -------------------------------------------------------------------------

  it('chapter 1 states its claim as unverified, so the assistant proves rather than asserts', () => {
    const ch = findChapter(1);
    expect(ch).toBeDefined();
    // Without this the chapter hands the assistant the answer and invites it to
    // narrate a conclusion it never checked — reintroducing the contamination
    // the common rules forbid.
    expect(CH1).toMatch(/have NOT yet verified it/i);
    expect(CH1).toMatch(/the claim, not yet a finding/i);
  });

  it('chapter 1 sends the learner to a source this platform does not control', () => {
    // The climax is worthless if the final check is relayed by us.
    expect(CH1).toContain('https://sepolia.base.org');
    expect(CH1).toMatch(/THEMSELVES, outside this chat/);
    expect(CH1).toMatch(/never heard of this platform/i);
  });

  it('chapter 1 introduces the hash exactly once, and only where it is load-bearing', () => {
    expect(CH1).toMatch(/only place a hash appears/i);
    // A reason, not a ritual: the chain is keyed by it, so nothing else will do.
    expect(CH1).toMatch(/keyed by a fingerprint/i);
  });

  it('every chapter is numbered uniquely and carries instructions', () => {
    const numbers = TUTORIAL_CHAPTERS.map((c) => c.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const c of TUTORIAL_CHAPTERS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.instructions.trim().length).toBeGreaterThan(500);
    }
  });
});
