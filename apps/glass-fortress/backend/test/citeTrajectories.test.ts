// ---------------------------------------------------------------------------
// cite_trajectories — the tool for changing what a thesis CITES, never what it
// SAYS.
//
// Every refusal here writes nothing. That is the point: the reason this tool
// exists is that the alternative (retyping the document through
// add_thesis_version) risks the prose, so a tool that half-applied a citation
// edit would be worse than the problem it solves.
// ---------------------------------------------------------------------------

interface Version {
  id: string;
  userContent: unknown;
  mentions: { type: string; refId: string }[];
}

const db = {
  thesis: null as { id: string; headVersionId: string | null; headVersion: Version | null } | null,
  created: [] as Record<string, unknown>[],
  headUpdates: [] as string[],
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesis: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        db.thesis && db.thesis.id === where.id ? db.thesis : null,
      ),
      update: jest.fn(async ({ data }: { data: { headVersionId: string } }) => {
        db.headUpdates.push(data.headVersionId);
        return {};
      }),
    },
    thesisVersion: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.created.push(data);
        return { id: 'v2', status: 'PENDING_AI', parentVersionId: data['parentVersionId'] };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
      const { prisma } = jest.requireMock('../src/lib/prisma') as { prisma: unknown };
      return fn(prisma);
    }),
  },
}));

const mockLoadLabels = jest.fn();
const mockResolve = jest.fn();
jest.mock('../src/services/trajectoryCitation', () => ({
  loadTrajectoryCitationLabels: (ids: readonly string[]) => mockLoadLabels(ids) as unknown,
  resolveTrajectoryCitations: (ids: readonly string[]) => mockResolve(ids) as unknown,
}));

jest.mock('../src/services/sessionService', () => ({ logSessionEvent: jest.fn() }));

import { citeTrajectoriesHandler } from '../src/mcp/tools/citeTrajectories';
import { logSessionEvent } from '../src/services/sessionService';

const SENTENCE = 'הטענות נותרו נעדרות לאורך שבעה תצלומים נוספים, עד התצלום מ-5 בספטמבר 2022.';

function headVersion(): Version {
  return {
    id: 'v1',
    userContent: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'בין התצלום מ-24 ביולי 2022 לתצלום מ-5 באוגוסט 2022 הוסרו נתונים.' },
            { type: 'evidenceMention', attrs: { id: '0xabc', label: 'ev' } },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: SENTENCE }] },
        // Mentions are DERIVED from the document by parseMentions, never copied
        // from the previous version's rows — so a chip that survives the splice
        // survives because it is still in the doc. Modelled here as the real
        // thesis has it: a trailing key-figure paragraph.
        {
          type: 'paragraph',
          content: [
            { type: 'keyFigureMention', attrs: { id: 'שרון אלרועי-פרייס', label: 'שרון אלרועי-פרייס' } },
          ],
        },
      ],
    },
    mentions: [
      { type: 'EVIDENCE', refId: '0xabc' },
      { type: 'KEY_FIGURE', refId: 'שרון אלרועי-פרייס' },
    ],
  };
}

function resolvedGroup(id: string, claimCount: number, citedCount: number) {
  return {
    id,
    claimText: 'claim',
    coMovement: {
      claimCount,
      members: Array.from({ length: claimCount }, (_, i) => ({
        id: `traj-${String(i + 1)}`,
        claimText: 'claim',
        cited: i < citedCount,
      })),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.created = [];
  db.headUpdates = [];
  const head = headVersion();
  db.thesis = { id: 't1', headVersionId: head.id, headVersion: head };
  mockLoadLabels.mockResolvedValue({ labels: new Map([['traj-1', 'claim one']]), unknown: [] });
  mockResolve.mockResolvedValue({ resolved: [resolvedGroup('traj-1', 1, 1)], missing: [] });
});

async function cite(placements: { anchorText: string; trajectoryIds: string[] }[], thesisId = 't1') {
  return JSON.parse(await citeTrajectoriesHandler({ thesisId, placements })) as Record<string, unknown>;
}

describe('cite_trajectories', () => {
  it('writes a new version citing the trajectory, with the previous head as parent', async () => {
    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    expect(r.headVersionId).toBe('v2');
    expect(r.parentVersionId).toBe('v1');
    expect(r.status).toBe('PENDING_AI');
    expect(db.headUpdates).toEqual(['v2']);
  });

  it('carries the existing mentions across and adds the trajectory one', async () => {
    await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    const created = db.created[0];
    const mentions = (created['mentions'] as { createMany: { data: { type: string; refId: string }[] } }).createMany.data;
    expect(mentions).toContainEqual({ type: 'EVIDENCE', refId: '0xabc' });
    expect(mentions).toContainEqual({ type: 'KEY_FIGURE', refId: 'שרון אלרועי-פרייס' });
    expect(mentions).toContainEqual({ type: 'CLAIM_TRAJECTORY', refId: 'traj-1' });
  });

  it('leaves the prose byte-identical, and says so in the result', async () => {
    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    const doc = db.created[0]['userContent'] as { content: { content?: { text?: string }[] }[] };
    const prose = doc.content.flatMap((b) => (b.content ?? []).map((n) => n.text ?? '')).join('');
    expect(prose).toContain(SENTENCE);
    expect(prose).toContain('בין התצלום מ-24 ביולי 2022');
    expect(String(r.prose)).toContain('UNCHANGED');
  });

  it('records the edit on the session as a citation-only change', async () => {
    await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    expect(logSessionEvent).toHaveBeenCalledWith('t1', 'VERSION_CREATED', expect.stringContaining('prose unchanged'), 'v2');
  });

  it('reports a co-movement that was only partly cited, without blocking it', async () => {
    // Which members belong in a given sentence is the researcher's judgement.
    // Citing 1 of 10 is a weaker claim than the archive supports, and saying so
    // is the tool's job; refusing it is not.
    mockResolve.mockResolvedValue({ resolved: [resolvedGroup('traj-1', 10, 1)], missing: [] });

    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    expect(r.headVersionId).toBe('v2');
    expect(r.coMovementIncomplete).toEqual([
      expect.objectContaining({ trajectoryId: 'traj-1', coMovementCount: 10, citedFromGroup: 1 }),
    ]);
  });

  it('refuses an anchor that is not in the thesis, and writes nothing', async () => {
    const r = await cite([{ anchorText: 'a sentence never written', trajectoryIds: ['traj-1'] }]);

    expect(r.error).toBe('ANCHOR_UNRESOLVED');
    expect(r.failures).toEqual([{ anchorText: 'a sentence never written', reason: 'NOT_FOUND' }]);
    expect(db.created).toHaveLength(0);
    expect(db.headUpdates).toHaveLength(0);
  });

  it('refuses an id that matches no row, and writes nothing', async () => {
    mockLoadLabels.mockResolvedValue({ labels: new Map(), unknown: ['not-an-id'] });

    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['not-an-id'] }]);

    expect(r.error).toBe('UNKNOWN_TRAJECTORY_ID');
    expect(db.created).toHaveLength(0);
  });

  it('refuses to cite the same trajectory twice — one finding, one marker', async () => {
    db.thesis!.headVersion!.mentions.push({ type: 'CLAIM_TRAJECTORY', refId: 'traj-1' });

    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);

    expect(r.error).toBe('ALREADY_CITED');
    expect(r.alreadyCited).toEqual(['traj-1']);
    expect(db.created).toHaveLength(0);
  });

  it('reports an unknown thesis rather than pretending', async () => {
    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }], 'nope');
    expect(r.error).toBe('THESIS_NOT_FOUND');
  });

  it('reports a thesis with no version to cite into', async () => {
    db.thesis = { id: 't1', headVersionId: null, headVersion: null };
    const r = await cite([{ anchorText: SENTENCE, trajectoryIds: ['traj-1'] }]);
    expect(r.error).toBe('NO_HEAD_VERSION');
  });
});
