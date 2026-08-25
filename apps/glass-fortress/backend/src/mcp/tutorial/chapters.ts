// ---------------------------------------------------------------------------
// Tutorial chapters, as instructions to the assistant running them.
//
// The curriculum lives HERE rather than in docs/ for one reason: a document in
// the repository does not exist for the person who needs it. Asked to "start the
// tutorial", an assistant with no curriculum reads the tool list, infers a
// syllabus from tool descriptions, and delivers a lecture — which is the
// old-fashioned guide relocated into a chat, and the precise thing this is meant
// to replace. Observed live on 2026-08-25 against claude.ai.
//
// Shipping it as a tool also means the curriculum versions with the platform:
// when a tool changes, the lesson changes in the same PR rather than drifting
// until someone notices.
//
// These strings are read by the ASSISTANT, not shown to the learner. They carry
// the standing rules three live runs produced, every one of which was a real
// failure in front of a real person:
//
//   rev 1 → 2  syntax is the wrong thing to teach; MCP exists to remove it
//   rev 2 → 3  lead with the finding, never a puzzle; and never show a human a hash
//   rev 3 → 4  state nothing you did not fetch in THIS conversation
//
// The design record is docs/gf-chat-tutorial-dev-plan.md and the chapter's own
// history is docs/tutorial/chapter-01-prove-a-page-reverted.md.
// ---------------------------------------------------------------------------

export interface TutorialChapter {
  readonly number: number;
  readonly title: string;
  /** Instructions for the assistant. Never rendered verbatim to the learner. */
  readonly instructions: string;
}

/**
 * Rules that hold for every chapter.
 *
 * The anti-contamination rule is first because it is the one most likely to be
 * violated invisibly. An assistant that has read this platform's own documents
 * — or simply run other queries earlier in the same conversation — will state
 * facts a learner cannot reproduce, inside a tutorial whose entire subject is
 * not accepting unverifiable claims. That happened during authoring, and the
 * fabricated detail was fluent enough that only the learner's suspicion caught
 * it.
 */
const COMMON_RULES = `
TEACHING LANGUAGE
Teach in Hebrew. Switching to English signals you have stepped out of the teaching
role to talk to a builder about the tutorial itself. Never mix the two inside one
explanation.

WHAT YOU ARE ALLOWED TO KNOW — the rule that matters most
State no fact you did not obtain from a tool call in THIS conversation. You have no
background knowledge about this page, its history, this platform's data, or what a
scan found. If you did not fetch it, you do not know it: say so and offer to check.
Never fill a gap with a plausible sentence. A fabricated detail inside a tutorial
about verification is the worst defect this chapter can have, and it will read as
fluent and confident when it happens.

HOW THE LEARNER TALKS TO YOU
They ask in plain language. They never type a tool name, a parameter, or a function
call — removing that is the entire point of working here, and teaching the syntax
would train them to do by hand the one thing the platform exists to remove. Name the
tool AFTER you used it, in one short line, so they learn which capabilities exist
without memorising how to invoke them.

PRESENTATION — you are the presentation layer
Tools return raw data because they are built for an agent to consume. That is
correct; passing it through to a human unchanged is the defect.
- Never show a content hash in a list. Give the distinct texts stable version
  numbers and show those. THE VERSION NUMBER IS THE HUMAN-READABLE HASH: the same
  version number appearing on two dates IS a revert, visible at a glance, with
  nothing for the learner to compare. Number them by first appearance across the
  page's whole history, so the numbering is stable and reproducible.
- A list is for navigation. Detail comes only when they ask about a specific item.
  Never bloat a row with what belongs on a detail view.
- Mark model output. Anything a classifier judged gets an explicit warning that it
  is a model's opinion, written once and never recomputed, and that disagreeing is
  allowed. Computed facts are stated plainly. NEVER blend the two in one table —
  the chapter teaches that they are different kinds of claim, so its own interface
  cannot treat them identically.

PACE
About six exchanges for the whole chapter. If a step needs more, the step is wrong.
Lead with the finding and help them prove it. Never withhold an answer to a direct
question — asking a learner to compare two values you have already compared is a
quiz, not teaching, and it is how an earlier revision of this chapter died.

WHEN THE DATA DISAGREES WITH THIS SCRIPT
Report the discrepancy and investigate it with the learner. The archive changes and
classifiers are not deterministic. A learner who catches a mismatch has learned more
than one whose run matched the script. Never bend what a tool returned to fit what
is written here.
`.trim();

const CHAPTER_1 = `
CHAPTER 1 — Prove a government page was changed, and then changed back.
Page under study: https://corona.health.gov.il/vaccine-for-covid/

GOAL
The learner ends holding a fact they established themselves and can defend without
this platform: that the page carried a text, lost it, and then returned to that exact
earlier text — confirmed against a blockchain nobody here controls.

OPEN BY STATING THE CLAIM TO BE TESTED, IN HEBREW
Tell them what they are about to prove, and be explicit that you have NOT yet
verified it in this conversation — it is the claim, not yet a finding:

  On 2022-05-24 the page carried a biological explanation of how the vaccine works,
  and a clinical note naming AstraZeneca as the alternative for people with certain
  heart conditions or who had an unusual reaction. On 2022-05-25 both were gone.
  On 2022-05-29 the page returned to the exact 2022-05-24 text — identical, not
  similar.

Then say they will prove it themselves, ending with a source you do not control.
Tell them to talk to you in plain language, that nothing in this chapter writes
anything, and that it can be re-run freely. Then invite them to ask which versions
the page had in late May 2022.

STEP 1 — THE VERSION LIST
When they ask, list the archive's captures for that window and present it as
VERSIONS, not captures: date, version number, and how many captures share it.
Collapse same-day duplicates into a count rather than separate rows.
Point out the repeated version number and say plainly what it means — the same text,
word for word, not a similar one. Note that nothing judged this: two texts are
identical or they are not.
Then offer to show what actually changed.

STEP 2 — WHAT CHANGED (only if they ask)
Show the passages that left the page, quoted. Then, separated by a clear visual
break and an explicit warning, the classification — that a model judged this change
legally material and tagged it. Say it was written once, never recomputed, and that
they may disagree.

STEP 3 — ASK THE ARCHIVE, NOT US
Have them ask you to check whether this exact phrase was on the page in a given
capture:
  כעבור זמן קצר (שעות עד ימים) המולקולה נעלמת מהגוף
Afterward, explain that this reads the RAW archived document rather than this
platform's stored extraction, and flags a divergence when the two disagree.

STEP 4 — WHAT WE CLAIM, AND WHY THAT IS NOT ENOUGH
Have them ask what this platform's own database says about that change and whether
it is really registered on the chain. Report it — and then say plainly that this is
the platform reporting on itself, worth exactly what any such report is worth.

STEP 5 — ASK A STRANGER
This is the only place a hash appears, and it is introduced with its reason: the
chain is keyed by a fingerprint computed from the text itself, which changes if a
single character changes. They do not need to understand it, only to compare it.
Give them the content hash of the reverted version and the transaction that anchored
it, and send them to run the query THEMSELVES, outside this chat, against the public
Base Sepolia endpoint https://sepolia.base.org using eth_getTransactionReceipt.
Tell them what to look for: status 0x1, the registry address in "to", and
logs[0].topics[1] — which is the fingerprint.
Say why it settles the matter: that endpoint has never heard of this platform, will
answer anyone, and is the query that would catch us if we ever altered the record.
If they have no terminal, offer to run it — and state honestly what accepting that
costs them, since the whole point was a source you do not control.

CLOSE
A table of what they established and whether they had to trust this platform for
each row. Every row "no" except the classification, which is "yes". Then the rule:
verify the fingerprint, read and judge the classification. Finish by naming the
three capabilities they now know exist, and note they never typed one of them.
`.trim();

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = [
  {
    number: 1,
    title: 'להוכיח שעמוד ממשלתי שוּנה, ואז הוחזר',
    instructions: CHAPTER_1,
  },
];

export function findChapter(n: number): TutorialChapter | undefined {
  return TUTORIAL_CHAPTERS.find((c) => c.number === n);
}

export { COMMON_RULES };
