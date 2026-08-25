import { z } from 'zod';
import { TUTORIAL_CHAPTERS, COMMON_RULES, findChapter } from '../tutorial/chapters';

// ---------------------------------------------------------------------------
// start_tutorial
//
// Makes the researcher tutorial exist where researchers actually are.
//
// Before this, the curriculum was a markdown file in the repository — which is
// to say it did not exist at all for anyone working in a chat client. Asked in
// claude.ai to "start the tutorial", the assistant read the tool list, inferred
// a syllabus from tool descriptions, and delivered a competent lecture about
// the platform's architecture. Nothing was verified, no data was touched, and
// nobody proved anything: the old-fashioned guide, relocated into a chat.
//
// Costs nothing to serve — no model, no RPC, no database, no network. It is
// therefore in READ_TOOLS, which is also what makes it reachable by an account
// that has signed up and is still awaiting approval. That state is modelled in
// researcherIdentity.ts and currently has nothing it can do, while the admin
// deciding about it has a handle and nothing else. This gives the waiting
// researcher a real task and the deciding admin real evidence.
// ---------------------------------------------------------------------------

export const startTutorialSchema = {
  chapter: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Chapter number to begin. Defaults to 1.'),
};

/**
 * Synchronous, unlike every other tool handler here, because it genuinely is:
 * the curriculum is a compiled-in constant with nothing to fetch. Marking it
 * `async` to match its neighbours would describe work that does not happen.
 */
export function startTutorialHandler(input: { chapter?: number }): string {
  const requested = input.chapter ?? 1;
  const chapter = findChapter(requested);

  if (!chapter) {
    return JSON.stringify({
      status: 'CHAPTER_NOT_AVAILABLE',
      requested,
      available: TUTORIAL_CHAPTERS.map((c) => ({ number: c.number, title: c.title })),
      // Said plainly rather than dressed up: a chapter that does not exist must
      // not be improvised. Improvising the curriculum is the exact failure this
      // tool was built to stop.
      explanation:
        `Chapter ${String(requested)} has not been written yet. Tell the learner so, and offer one of ` +
        'the available chapters. Do NOT invent a chapter, and do not assemble one from the ' +
        'tool list — an improvised syllabus is what this tool exists to replace.',
    });
  }

  return JSON.stringify({
    status: 'OK',
    chapter: chapter.number,
    title: chapter.title,
    audience: 'A researcher who may never have used this platform.',
    // Named explicitly because the failure mode is an assistant pasting the
    // instructions into the conversation instead of acting on them.
    howToUse:
      'These are instructions FOR YOU, not text to show the learner. Follow them, in your own ' +
      'words, in Hebrew. Do not paste this response into the conversation.',
    rules: COMMON_RULES,
    instructions: chapter.instructions,
    writesNothing: true,
    nextChapterAvailable: TUTORIAL_CHAPTERS.some((c) => c.number === chapter.number + 1),
  });
}
