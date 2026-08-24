// ---------------------------------------------------------------------------
// The Devil's Advocate reads a thesis's trajectory citations.
//
// Written from a measurement, not a hunch. Thesis cmt5jffqy…, which cites 21
// trajectories across 8 co-movement groups, was compared against the version
// that cited none: the critic's ENTIRE input was byte-identical — same thesis
// text hash, same trajectory block hash, same evidence, same resolved gaps.
// Two causes, both here:
//
//   1. extractText had no case for trajectoryMention, so 21 nodes contributed ''.
//   2. triggerAIAnalysis read `type: 'EVIDENCE'` mentions only, and derived
//      trajectories from that evidence — the citations were never read.
//
// A third defect sat in the cap: only 3 of the 8 cited groups reached the critic,
// because MAX_GROUPS_PER_URL keeps the LARGEST groups and the citation had been
// widened, correctly, with five singletons. The narrow set that would have
// under-supported a true universal stayed visible; the correction did not.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesisVersion: { findUnique: jest.fn(), update: jest.fn() },
    evidence: { findMany: jest.fn() },
    thesisGapResolution: { findMany: jest.fn() },
    claimTrajectory: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/trajectoryContext', () => {
  const actual = jest.requireActual('../src/lib/trajectoryContext');
  return { ...actual, loadTrajectoryContext: jest.fn() };
});
jest.mock('../src/lib/summaryProvenance', () => ({ loadSummaryCaveat: jest.fn() }));
jest.mock('../src/services/sessionService', () => ({ logSessionEvent: jest.fn() }));

const analyze = jest.fn();
jest.mock('../src/services/DevilsAdvocateAgent', () => ({
  DevilsAdvocateAgent: jest.fn().mockImplementation(() => ({ analyze })),
}));

import { prisma } from '../src/lib/prisma';
import { loadTrajectoryContext, emptyTrajectoryBundle } from '../src/lib/trajectoryContext';
import { loadSummaryCaveat } from '../src/lib/summaryProvenance';
import { extractText, triggerAIAnalysis } from '../src/services/thesisAnalysis';

/** One paragraph, one sentence, then N trajectory mentions, then more prose. */
function docCiting(ids: string[]) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'הטענות נותרו נעדרות לאורך שבעה תצלומים נוספים.' },
          ...ids.map((id) => ({ type: 'trajectoryMention', attrs: { id, label: `tr_${id}` } })),
          { type: 'text', text: ' זהו הממצא.' },
        ],
      },
    ],
  };
}

describe('extractText and trajectory citations', () => {
  const ids = ['t1', 't2', 't3'];

  it('renders nothing for trajectory mentions when no labels are supplied', () => {
    // The prose consumers — the publication gate, audit_thesis_claims, every
    // stored preview — rely on cite_trajectories leaving the prose byte-identical.
    // A citation that silently changed the text being verified would break the one
    // guarantee that makes citing a claim safe.
    const withCitations = extractText(docCiting(ids));
    const withoutCitations = extractText(docCiting([]));
    expect(withCitations).toBe(withoutCitations);
    expect(withCitations).not.toContain('#traj');
  });

  it('renders one marker per cited movement when labels are supplied', () => {
    const labels = new Map([
      ['t1', 'T1'],
      ['t2', 'T1'],
      ['t3', 'T5'],
    ]);
    const text = extractText(docCiting(ids), labels);
    // t1 and t2 are two members of ONE co-movement. Emitting a marker each is the
    // renderer's old defect — one finding reported as N — moved into the prompt,
    // where nothing downstream would ever collapse it.
    expect(text).toContain('#traj_T1 #traj_T5');
    expect(text.match(/#traj_T1/g)).toHaveLength(1);
    expect(text).toContain('שבעה תצלומים נוספים. #traj_T1 #traj_T5 זהו הממצא.');
  });

  it('keeps a second citation of the same movement elsewhere in the document', () => {
    // Collapse is scoped to a consecutive run: citing a movement again in a later
    // sentence is a second citation, and a reader must see that it was made twice.
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'First.' },
          { type: 'trajectoryMention', attrs: { id: 't1' } },
        ] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Second.' },
          { type: 'trajectoryMention', attrs: { id: 't2' } },
        ] },
      ],
    };
    const text = extractText(doc, new Map([['t1', 'T1'], ['t2', 'T1']]));
    expect(text.match(/#traj_T1/g)).toHaveLength(2);
  });

  it('drops a mention whose id is not in the label map rather than inventing one', () => {
    // An id with no label resolved to no rendered group: it is in citedNotResolved,
    // and the block says so. A marker pointing at a [Tn] that is not there would be
    // worse than silence.
    expect(extractText(docCiting(['ghost']), new Map())).not.toContain('#traj');
  });
});

describe('triggerAIAnalysis passes the document\'s citations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.thesisGapResolution.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      { fileHash: '0xaaa', investigativeCategories: [], targetEntity: 'MOH',
        evidenceTier: 'TIER_1', evidenceRole: 'PRIMARY', evidenceDate: '2022-08-05', summary: 's' },
    ]);
    (prisma.thesisVersion.update as jest.Mock).mockResolvedValue({});
    (loadSummaryCaveat as jest.Mock).mockResolvedValue(null);
    (loadTrajectoryContext as jest.Mock).mockResolvedValue({
      ...emptyTrajectoryBundle(),
      trajectories: [
        { url: 'u', patternHash: 'p1', claimCount: 2, transitions: 2, finalState: 'REMOVED',
          changes: [], claims: [], overlappingEvidence: [], citedIds: ['t1', 't2'] },
      ],
    });
    analyze.mockResolvedValue({
      counterArguments: [], evidenceGaps: [], alternativeInterpretations: [],
      overallStrengthAssessment: 'MODERATE', summaryHe: 'ס',
    });
  });

  function version(mentions: { type: string; refId: string }[]) {
    (prisma.thesisVersion.findUnique as jest.Mock).mockResolvedValue({
      id: 'v1', thesisId: 'th1', parentVersionId: null, mentions,
    });
  }

  it('reads CLAIM_TRAJECTORY mentions and hands them to the trajectory loader', async () => {
    version([
      { type: 'EVIDENCE', refId: '0xaaa' },
      { type: 'CLAIM_TRAJECTORY', refId: 't1' },
      { type: 'CLAIM_TRAJECTORY', refId: 't2' },
    ]);

    await triggerAIAnalysis('v1', docCiting(['t1', 't2']));

    expect(loadTrajectoryContext).toHaveBeenCalledWith([expect.objectContaining({ fileHash: '0xaaa' })], ['t1', 't2']);
    // Evidence lookup must still see only the evidence hashes: a trajectory id is
    // not a fileHash, and querying with both mixed together is how a citation
    // would silently widen the evidence set.
    expect(prisma.evidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fileHash: { in: ['0xaaa'] } } }),
    );
  });

  it('labels the markers in the thesis text with the block position of their group', async () => {
    version([
      { type: 'EVIDENCE', refId: '0xaaa' },
      { type: 'CLAIM_TRAJECTORY', refId: 't1' },
      { type: 'CLAIM_TRAJECTORY', refId: 't2' },
    ]);

    await triggerAIAnalysis('v1', docCiting(['t1', 't2']));

    const thesisText = analyze.mock.calls[0][0] as string;
    // Both ids belong to the first rendered group, so the sentence carries ONE
    // marker naming [T1] — the label the block itself uses.
    expect(thesisText).toContain('#traj_T1');
    expect(thesisText.match(/#traj_/g)).toHaveLength(1);
  });

  it('leaves the text unmarked when the thesis cites no trajectories', async () => {
    version([{ type: 'EVIDENCE', refId: '0xaaa' }]);
    (loadTrajectoryContext as jest.Mock).mockResolvedValue(emptyTrajectoryBundle());

    await triggerAIAnalysis('v1', docCiting([]));

    expect(loadTrajectoryContext).toHaveBeenCalledWith(expect.anything(), []);
    expect(analyze.mock.calls[0][0]).not.toContain('#traj');
  });
});
