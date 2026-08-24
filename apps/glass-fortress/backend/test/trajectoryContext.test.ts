// ---------------------------------------------------------------------------
// Making trajectories visible to the agents that reason over a corpus.
//
// Written from a real failure. A framing assessor told a researcher their
// evidence showed "no restoration" of removed safety text, citing an anchored
// record. The archive showed five claims removed on 2022-08-05 and restored on
// 2022-09-06 — the researcher was right. The assessor read only model-written
// summaries; the deterministic layer that proved the point was not in its corpus.
//
// The second lesson is here too, and it cost a rewrite. Overlap between a
// trajectory and an evidence record was first computed by matching DATES, and
// flagged the whole record as non-independent. But a diff-based evidence record
// is not one assertion: one diff holds many items, each with its own
// classification since categories moved to the item. Tarring all fourteen
// because eight overlap is how a consequential claim gets lost in a crowd — the
// same defect item-level classification was built to remove.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { findMany: jest.fn() }, claimTrajectory: { findMany: jest.fn() } },
}));
jest.mock('../src/services/claimTrajectory', () => {
  const actual = jest.requireActual('../src/services/claimTrajectory');
  return { ...actual, getClaimTrajectories: jest.fn() };
});

import { prisma } from '../src/lib/prisma';
import { getClaimTrajectories, claimHash, normaliseClaim } from '../src/services/claimTrajectory';
import {
  loadTrajectoryContext,
  formatTrajectoryContext,
  emptyTrajectoryBundle,
} from '../src/lib/trajectoryContext';

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

/** A claim long enough to be followed as a trajectory. */
const FOLLOWED = 'במהלך הניסויים הקליניים של חיסוני הפעוטות לא התגלו בעיות בטיחות חריגות או תופעות לא צפויות';
/** Also long enough, but this one never oscillated, so no trajectory covers it. */
const UNFOLLOWED = 'הקישור לדיווח על תופעות לוואי הוסר מן הדף במסגרת אותו עדכון בדיוק, ולא הוחזר מאז';

function item(quote: string, significant: boolean) {
  return {
    summary: 's',
    exactQuote: quote,
    investigativeCategories: significant ? ['WITHHOLDING_INFORMATION'] : [],
    relocated: false,
  };
}

function evidenceRow(fileHash: string, items: ReturnType<typeof item>[], tracked: string | null = URL) {
  return {
    fileHash,
    urlVersionDiff: tracked
      ? { deletedText: JSON.stringify(items), addedText: '[]', trackedUrl: { url: tracked } }
      : null,
  };
}

function groupOf(claims: string[]) {
  return {
    patternHash: 'pattern-1',
    transitions: 2,
    firstSeen: '2022-08-05',
    lastSeen: '2022-09-05',
    finalState: 'REMOVED' as const,
    changes: [
      { snapshotDate: '2022-08-05', waybackTimestamp: '1', snapshotUrl: `${URL}#a`, present: true },
      { snapshotDate: '2022-09-06', waybackTimestamp: '2', snapshotUrl: `${URL}#b`, present: false },
    ],
    claims: claims.map((c) => ({ claimHash: claimHash(normaliseClaim(c)), claimText: c })),
  };
}

describe('loadTrajectoryContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [groupOf([FOLLOWED])] });
  });

  it('returns nothing for an empty corpus without querying', async () => {
    expect(await loadTrajectoryContext([], [])).toEqual(emptyTrajectoryBundle());
    expect(prisma.evidence.findMany).not.toHaveBeenCalled();
  });

  it('loads trajectories for the tracked page the evidence came from', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);

    const { trajectories } = await loadTrajectoryContext([{ fileHash: '0xaaa' }], []);

    expect(trajectories).toHaveLength(1);
    expect(trajectories[0].url).toBe(URL);
    expect(trajectories[0].finalState).toBe('REMOVED');
  });

  it('matches overlap on the claim itself, not on the date', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xshares', [item(FOLLOWED, true)]),
      evidenceRow('0xshares-nothing', [item(UNFOLLOWED, true)]),
    ]);

    const { trajectories } = await loadTrajectoryContext([
      { fileHash: '0xshares' },
      { fileHash: '0xshares-nothing' },
    ], []);

    // Both records sit on the same page and the same transition dates. Only the
    // one that actually contains the claim overlaps.
    expect(trajectories[0].overlappingEvidence).toEqual([{ fileHash: '0xshares', sharedItems: 1 }]);
  });

  it('reports a classified item no trajectory covers as independent', async () => {
    // THE case a record-level flag destroys. This record's fourth item is a
    // one-time removal: never restored, so never a trajectory, and its
    // significance is entirely its own. Discounting it because three neighbours
    // overlap would lose a finding — FINDING 17, by a different route.
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xmixed', [
        item(FOLLOWED, true),
        item(UNFOLLOWED, true),
        item('short', true),
        item('a long enough quote that carries no classification at all from the item classifier', false),
      ]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xmixed' }], []);

    expect(coverage).toEqual([
      {
        fileHash: '0xmixed',
        totalItems: 4,
        itemsInTrajectories: 1,
        // UNFOLLOWED and the short one: classified, and covered by no trajectory.
        // The unclassified fourth item is not counted — it asserts nothing.
        independentSignificantItems: 2,
      },
    ]);
  });

  // The nesting case is not hypothetical — both of these are trajectory claims in
  // the real 10-claim group from the first run on corona.health.gov.il, and one
  // contains the other verbatim.
  const SHORT_FORM = 'את החיסון הרביעי מקבלים 4 חודשים לפחות ממועד קבלת החיסון השלישי.';
  const LONG_FORM = `${SHORT_FORM} סוג התרכיב שניתן בחיסון הרביעי עדיף לתת חיסון רביעי המבוסס על mRNA`;

  it('treats a nested quote as covered, not as independent', async () => {
    // Exact hashing alone calls these unrelated, so an item carrying the longer
    // form would be counted INDEPENDENT while being wholly covered — which
    // OVERSTATES corroboration, the dangerous direction for a signal feeding how
    // much weight a model gives evidence.
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [groupOf([SHORT_FORM])] });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xnested', [item(LONG_FORM, true)]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xnested' }], []);

    expect(coverage[0].itemsInTrajectories).toBe(1);
    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('matches containment in both directions', async () => {
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [groupOf([LONG_FORM])] });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xshorter', [item(SHORT_FORM, true)]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xshorter' }], []);

    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('never matches a short item by containment', async () => {
    // A short string is a substring of unrelated claims by accident. A false
    // match here would discount a classified item — the direction that LOSES a
    // finding, which is the more serious error on this platform.
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [groupOf([LONG_FORM])] });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xshort', [item('החיסון הרביעי', true)]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xshort' }], []);

    expect(coverage[0].independentSignificantItems).toBe(1);
  });

  it('counts coverage against every trajectory, not one group at a time', async () => {
    // An item covered by trajectory B is not independent merely because group A
    // missed it. Per-group accounting would report it independent once per group.
    (getClaimTrajectories as jest.Mock).mockResolvedValue({
      groups: [groupOf([FOLLOWED]), { ...groupOf([UNFOLLOWED]), patternHash: 'pattern-2' }],
    });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xboth', [item(FOLLOWED, true), item(UNFOLLOWED, true)]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xboth' }], []);

    expect(coverage[0].itemsInTrajectories).toBe(2);
    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('never lets one page\'s claims mark another page\'s item as covered', async () => {
    // Two government pages can carry the same 40+ character boilerplate, and one
    // page's text oscillating says NOTHING about the other. Accumulating the
    // claim set across the loop over-matches, which lowers
    // independentSignificantItems below the truth — understating independent
    // evidence, the direction that LOSES a finding.
    const OTHER = 'https://corona.health.gov.il/some-other-page/';
    (getClaimTrajectories as jest.Mock).mockImplementation(async (url: string) =>
      url === OTHER ? { groups: [groupOf([FOLLOWED])] } : { groups: [] },
    );
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      // Same text, different page, and only the OTHER page has a trajectory.
      evidenceRow('0xpageA', [item(FOLLOWED, true)], URL),
      evidenceRow('0xpageB', [item(FOLLOWED, true)], OTHER),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xpageA' }, { fileHash: '0xpageB' }], []);

    const pageA = coverage.find((c) => c.fileHash === '0xpageA');
    const pageB = coverage.find((c) => c.fileHash === '0xpageB');
    expect(pageA?.independentSignificantItems).toBe(1); // no trajectory on ITS page
    expect(pageB?.independentSignificantItems).toBe(0);
  });

  it('computes coverage against every group, not only the ones it shows', async () => {
    // Rendering is capped per URL; reasoning is not. Building the coverage set
    // from the rendered slice reports items covered by group 9+ as independent,
    // which OVERSTATES corroboration — the error this whole change exists to stop.
    // The corona page already produces 15 groups against a cap of 8.
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...groupOf([`${FOLLOWED} — variant number ${i} with enough text to pass the length gate`]),
      patternHash: `pattern-${i}`,
    }));
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: many });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      // This item's claim lives in group 11 — beyond the display cap of 8.
      evidenceRow('0xlate', [
        item(`${FOLLOWED} — variant number 11 with enough text to pass the length gate`, true),
      ]),
    ]);

    const { trajectories, coverage, omittedGroups } = await loadTrajectoryContext([{ fileHash: '0xlate' }], []);

    expect(trajectories).toHaveLength(8); // display cap honoured
    expect(omittedGroups).toBe(4); // and reported, never silent
    expect(coverage[0].itemsInTrajectories).toBe(1);
    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('contributes nothing for evidence that was never archived over time', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);

    expect(await loadTrajectoryContext([{ fileHash: '0xarticle' }], [])).toEqual(emptyTrajectoryBundle());
    expect(getClaimTrajectories).not.toHaveBeenCalled();
  });

  it('does not let one unscanned page break a corpus drawn from several', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);
    (getClaimTrajectories as jest.Mock).mockRejectedValue(new Error('No tracked URL found'));

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], []);
    expect(bundle.trajectories).toEqual([]);
  });
});

describe('formatTrajectoryContext', () => {
  const bundle = {
    trajectories: [
      {
        url: URL,
        patternHash: 'p1',
        claimCount: 8,
        transitions: 2,
        finalState: 'REMOVED' as const,
        changes: [
          { snapshotDate: '2022-08-05', present: true, snapshotUrl: `${URL}#a` },
          { snapshotDate: '2022-09-06', present: false, snapshotUrl: `${URL}#b` },
        ],
        claims: [FOLLOWED],
        overlappingEvidence: [{ fileHash: '0xmixed', sharedItems: 8 }],
        citedIds: [],
      },
    ],
    coverage: [
      { fileHash: '0xmixed', totalItems: 14, itemsInTrajectories: 8, independentSignificantItems: 6 },
    ],
    omittedGroups: 0,
    citedNotResolved: [],
  };

  it.each(['en', 'he'] as const)('marks omitted groups rather than dropping them silently in %s', (lang) => {
    // A truncated set makes a partial answer look complete. The note also has to
    // say the omission is display-only, or a reader discounts the coverage counts.
    const out = formatTrajectoryContext({ ...bundle, omittedGroups: 7 }, lang);
    expect(out).toContain('7');
    expect(out).toMatch(lang === 'en' ? /display only/ : /בתצוגה בלבד/);
  });

  it('renders nothing when there are no trajectories', () => {
    const empty = emptyTrajectoryBundle();
    expect(formatTrajectoryContext(empty, 'en')).toBe('');
    expect(formatTrajectoryContext(empty, 'he')).toBe('');
  });

  it.each(['en', 'he'] as const)('carries the precedence rule in %s', (lang) => {
    // The rule travels WITH the data: an agent must not be able to receive
    // trajectories without being told what they outrank.
    const out = formatTrajectoryContext(bundle, lang);
    expect(out).toMatch(lang === 'en' ? /PRECEDENCE/ : /כלל הכרעה/);
  });

  it.each(['en', 'he'] as const)('scopes precedence to presence, not interpretation, in %s', (lang) => {
    // A trajectory is authoritative on "this exact string was in the page text at
    // this capture" and nothing else. Unscoped, a model told the summary is wrong
    // may discount its interpretation too — the same over-reach one notch smaller.
    const out = formatTrajectoryContext(bundle, lang);
    expect(out).toMatch(lang === 'en' ? /does NOT\s*\n?\s*follow that its interpretation/ : /אין נובע מכך שפרשנותו שגויה/);
    // And it must say what a raw string search cannot know.
    expect(out).toMatch(lang === 'en' ? /nav menu or a footer/ : /תפריט ניווט/);
  });

  it.each(['en', 'he'] as const)('limits the overlap claim to page state in %s', (lang) => {
    // An evidence record also carries classification, tier reasoning, correlation
    // to dated external events and key figures. A trajectory duplicates none of
    // them, so "one observation" must not read as "discount the interpretation".
    const out = formatTrajectoryContext(bundle, lang);
    expect(out).toMatch(lang === 'en' ? /same page state/ : /אותו מצב עמוד/);
    expect(out).toMatch(lang === 'en' ? /are not discounted by this/ : /אינם מנוכים בשלו/);
  });

  it.each(['en', 'he'] as const)('states what the trajectories do NOT cover in %s', (lang) => {
    // Without this, a model reading "8 shared items" discounts all fourteen.
    const out = formatTrajectoryContext(bundle, lang);
    expect(out).toContain('0xmixed');
    expect(out).toMatch(lang === 'en' ? /8 of 14 items/ : /8 מתוך 14/);
    expect(out).toMatch(lang === 'en' ? /6 classified items are/ : /6 פריטים מסווגים/);
    expect(out).toMatch(lang === 'en' ? /independent evidence/ : /ראיה עצמאית/);
  });

  it('omits the coverage section when every item is accounted for', () => {
    const covered = {
      trajectories: bundle.trajectories,
      coverage: [{ fileHash: '0xall', totalItems: 8, itemsInTrajectories: 8, independentSignificantItems: 0 }],
      omittedGroups: 0,
      citedNotResolved: [],
    };
    expect(formatTrajectoryContext(covered, 'en')).not.toMatch(/DO NOT COVER/);
  });

  it('includes the archived snapshot URLs so a reader can check it', () => {
    // The entire value of this layer is that it can be verified without trusting
    // the platform. Rendering the pattern without the URLs removes exactly that.
    const out = formatTrajectoryContext(bundle, 'en');
    expect(out).toContain(`${URL}#a`);
    expect(out).toContain(`${URL}#b`);
  });

  it('shows the co-movement count, not just the claim', () => {
    expect(formatTrajectoryContext(bundle, 'en')).toContain('8 claims that moved as one unit');
  });
});

// ---------------------------------------------------------------------------
// Citations: what the DOCUMENT argues from, as opposed to what merely shares a
// page with its evidence.
//
// Measured on the real thesis before this existed: 21 cited trajectories across
// 8 co-movement groups, of which only 3 reached the critic. The cap kept the
// largest groups, and the citation had been widened — correctly — with five
// singletons, because the sentence it supports is a universal and one
// counter-example falsifies it. Size-ranked truncation dropped exactly the
// correction that made the citation honest.
// ---------------------------------------------------------------------------
describe('loadTrajectoryContext with citations', () => {
  /** A distinct group per index, smallest last, mirroring the real sort order. */
  function groups(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      patternHash: `pattern-${i}`,
      transitions: 2,
      firstSeen: '2022-08-05',
      lastSeen: '2022-09-05',
      finalState: 'REMOVED' as const,
      changes: [
        { snapshotDate: '2022-08-05', waybackTimestamp: '1', snapshotUrl: `${URL}#a`, present: true },
        { snapshotDate: '2022-09-06', waybackTimestamp: '2', snapshotUrl: `${URL}#b`, present: false },
      ],
      claims: Array.from({ length: count - i }, (_, n) => {
        const text = `${FOLLOWED} — variant ${i}.${n}`;
        return { id: `live-${i}-${n}`, claimHash: claimHash(normaliseClaim(text)), claimText: text };
      }),
    }));
  }

  const hashOf = (i: number, n: number) => claimHash(normaliseClaim(`${FOLLOWED} — variant ${i}.${n}`));

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: groups(10) });
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('caps at eight and reports the rest when nothing is cited', async () => {
    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], []);
    expect(bundle.trajectories).toHaveLength(8);
    expect(bundle.omittedGroups).toBe(2);
    expect(bundle.citedNotResolved).toEqual([]);
    expect(prisma.claimTrajectory.findMany).not.toHaveBeenCalled();
  });

  it('never drops a cited group, however small, and however far down the order', async () => {
    // Group 9 is the single-claim group the size-ranked cap used to discard.
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-a', claimHash: hashOf(9, 0), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['cited-a']);

    const shown = bundle.trajectories.map((t) => t.patternHash);
    expect(shown).toContain('pattern-9');
    // The cited singleton, plus a full context budget of 8 uncited groups.
    expect(bundle.trajectories).toHaveLength(9);
    expect(bundle.omittedGroups).toBe(1);
    expect(bundle.trajectories.find((t) => t.patternHash === 'pattern-9')?.citedIds).toEqual(['cited-a']);
    expect(bundle.citedNotResolved).toEqual([]);
  });

  it('does not let citations consume the context budget', async () => {
    // Support and context are different in kind and must not compete. While they
    // shared one allowance, a thesis citing eight movements paid for its own
    // honesty by starving the critique of page context — which is exactly what
    // happened on the real thesis, and cost it one of three counter-arguments.
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({ id: `cited-${i}`, claimHash: hashOf(i, 0), trackedUrl: { url: URL } })),
    );

    const bundle = await loadTrajectoryContext(
      [{ fileHash: '0xaaa' }],
      Array.from({ length: 9 }, (_, i) => `cited-${i}`),
    );

    // All 9 cited, PLUS the one remaining uncited group as context.
    expect(bundle.trajectories).toHaveLength(10);
    expect(bundle.trajectories.filter((t) => t.citedIds.length > 0)).toHaveLength(9);
    expect(bundle.trajectories.filter((t) => t.citedIds.length === 0)).toHaveLength(1);
    expect(bundle.omittedGroups).toBe(0);
  });

  it('resolves a citation pinned to an earlier detection pass, by claim hash', async () => {
    // The cited row belongs to a pass whose ids no longer exist. patternHash
    // hashes the presence vector and changes whenever a snapshot is added, so
    // neither the row id nor the pattern survives a new pass — the claim hash is
    // the only join that does.
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'from-an-old-pass', claimHash: hashOf(0, 0), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['from-an-old-pass']);

    expect(bundle.trajectories[0].citedIds).toEqual(['from-an-old-pass']);
    expect(bundle.citedNotResolved).toEqual([]);
  });

  it('reports a citation that no current group contains rather than dropping it', async () => {
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'no-longer-followed', claimHash: claimHash(normaliseClaim(UNFOLLOWED)), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['no-longer-followed']);

    expect(bundle.citedNotResolved).toEqual(['no-longer-followed']);
    expect(bundle.trajectories.every((t) => t.citedIds.length === 0)).toBe(true);
  });

  it('reports every citation as unresolved when the corpus has no archived page', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);

    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xarticle' }], ['gone']);

    expect(bundle.citedNotResolved).toEqual(['gone']);
    expect(getClaimTrajectories).not.toHaveBeenCalled();
  });

  it('keeps a cited group that a single flip would otherwise exclude', async () => {
    // A one-flip claim is an ordinary removal and is not worth prompt room as
    // context. Cited, it is the argument. On the real thesis this is the
    // FDA-approval sentence — the exact claim the critique argued about while the
    // trajectory proving its removal was filtered out of the critique's input.
    const oneFlip = {
      ...groups(1)[0],
      patternHash: 'pattern-single-flip',
      transitions: 1,
      claims: [{ id: 'live-x', claimHash: hashOf(0, 0), claimText: `${FOLLOWED} — variant 0.0` }],
    };
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [oneFlip, ...groups(3)] });
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-flip', claimHash: hashOf(0, 0), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['cited-flip']);

    expect(bundle.trajectories.map((t) => t.patternHash)).toContain('pattern-single-flip');
    expect(bundle.citedNotResolved).toEqual([]);
    // Uncited single-flip groups stay excluded, and are not reported as truncated:
    // they were never candidates, and counting a deliberate exclusion as an
    // omission would make the note meaningless.
    expect(bundle.omittedGroups).toBe(0);
  });

  it('still excludes an uncited single-flip group', async () => {
    const oneFlip = {
      ...groups(1)[0],
      patternHash: 'pattern-single-flip',
      transitions: 1,
      claims: [{ id: 'live-y', claimHash: claimHash(normaliseClaim(UNFOLLOWED)), claimText: UNFOLLOWED }],
    };
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [oneFlip, ...groups(3)] });
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-a', claimHash: hashOf(0, 0), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['cited-a']);

    expect(bundle.trajectories.map((t) => t.patternHash)).not.toContain('pattern-single-flip');
  });

  it('looks on the pages the CITATIONS are on, not only the pages the evidence came from', async () => {
    // Nothing requires a thesis to cite a trajectory on a page its evidence was
    // promoted from — the publication gate requires evidence, not evidence from the
    // same URL. Deriving the page list from evidence alone made such a citation
    // report itself as "no longer followed": a page never looked at, described as a
    // claim that stopped being true.
    const OTHER = 'https://corona.health.gov.il/vaccine-for-kids/';
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-elsewhere', claimHash: hashOf(0, 0), trackedUrl: { url: OTHER } },
    ]);
    (getClaimTrajectories as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve({ groups: url === OTHER ? groups(1) : [] }),
    );

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['cited-elsewhere']);

    expect(getClaimTrajectories).toHaveBeenCalledWith(OTHER, expect.anything());
    expect(bundle.trajectories.map((t) => t.url)).toEqual([OTHER]);
    expect(bundle.citedNotResolved).toEqual([]);
  });

  it('resolves a citation even when the thesis cites no diff-based evidence at all', async () => {
    const OTHER = 'https://corona.health.gov.il/vaccine-for-kids/';
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-elsewhere', claimHash: hashOf(0, 0), trackedUrl: { url: OTHER } },
    ]);
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: groups(1) });

    const bundle = await loadTrajectoryContext([{ fileHash: '0xarticle' }], ['cited-elsewhere']);

    expect(bundle.trajectories).toHaveLength(1);
    expect(bundle.citedNotResolved).toEqual([]);
  });

  it('quotes the cited members of a group before the uncited ones', async () => {
    // The excerpt is capped at four. Quoting four arbitrary members of a
    // ten-claim group can quote none of the ones the thesis rests on.
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'cited-last', claimHash: hashOf(0, 9), trackedUrl: { url: URL } },
    ]);

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }], ['cited-last']);

    expect(bundle.trajectories[0].claims[0]).toContain('variant 0.9');
  });
});

describe('formatTrajectoryContext with citations', () => {
  const cited = {
    ...emptyTrajectoryBundle(),
    trajectories: [
      {
        url: URL, patternHash: 'p1', claimCount: 4, transitions: 2, finalState: 'REMOVED' as const,
        changes: [{ snapshotDate: '2022-08-05', present: false, snapshotUrl: `${URL}#a` }],
        claims: [FOLLOWED], overlappingEvidence: [], citedIds: ['a', 'b'],
      },
      {
        url: URL, patternHash: 'p2', claimCount: 3, transitions: 1, finalState: 'PRESENT' as const,
        changes: [{ snapshotDate: '2022-09-06', present: true, snapshotUrl: `${URL}#b` }],
        claims: [UNFOLLOWED], overlappingEvidence: [], citedIds: [],
      },
    ],
  };

  it.each(['en', 'he'] as const)('separates what the thesis cites from what it does not in %s', (lang) => {
    const out = formatTrajectoryContext(cited, lang);
    const marker = lang === 'en' ? 'CITED BY THIS THESIS' : 'מצוטט בתזה';
    const negative = lang === 'en' ? 'not cited by this thesis' : 'אינו מצוטט בתזה';
    expect(out).toContain(marker);
    expect(out).toContain(negative);
    // The count is the thing FINDING 61 turned on: a sentence resting on many
    // claims read as resting on the one or two the critic happened to be shown.
    expect(out).toContain(lang === 'en' ? '2 claims across 1 trajectory' : '2 טענות במסלול אחד');
  });

  it('says nothing about citation when nothing cites — framing precedes the document', () => {
    const uncited = {
      ...cited,
      trajectories: cited.trajectories.map((t) => ({ ...t, citedIds: [] })),
    };
    const out = formatTrajectoryContext(uncited, 'en');
    expect(out).not.toMatch(/CITED|not cited/);
  });

  it('marks citations that resolved to no group', () => {
    const out = formatTrajectoryContext({ ...cited, citedNotResolved: ['x', 'y'] }, 'en');
    expect(out).toContain('2 citations match no trajectory in the latest detection pass');
  });
});

describe('formatTrajectoryContext context rendering', () => {
  function block(i: number, cited: boolean) {
    return {
      url: URL, patternHash: `p${i}`, claimCount: 2, transitions: 3, finalState: 'REMOVED' as const,
      changes: [{ snapshotDate: '2022-08-05', present: false, snapshotUrl: `${URL}#${i}` }],
      claims: [FOLLOWED], overlappingEvidence: [{ fileHash: '0xmixed', sharedItems: 2 }],
      citedIds: cited ? [`c${i}`] : [],
    };
  }

  it('renders cited movements in full and uncited ones in short form', () => {
    const mixed = {
      ...emptyTrajectoryBundle(),
      trajectories: [block(0, true), block(1, false), block(2, false)],
    };
    const out = formatTrajectoryContext(mixed, 'en');

    // Every movement is listed; only one carries quotes and snapshot links.
    expect(out.match(/\[T\d+\]/g)).toHaveLength(3);
    expect(out.match(/Archived snapshots/g)).toHaveLength(1);
    // Overlap survives the shortening: it is the strongest signal that an uncited
    // movement is relevant at all, and it costs one line.
    expect(out.match(/0xmixed/g)).toHaveLength(3);
    expect(out).toContain('2 uncited trajectories are shown in short form');
    expect(out).toContain('say so explicitly rather than relying on wording you were not shown');
  });

  it('shortens nothing when no document is citing', () => {
    // Framing and synthesis precede a document. Shortening there would degrade a
    // caller that has no citations to protect, for a saving nothing asked for.
    const uncited = {
      ...emptyTrajectoryBundle(),
      trajectories: [block(0, false), block(1, false)],
    };
    const out = formatTrajectoryContext(uncited, 'en');

    expect(out.match(/Archived snapshots/g)).toHaveLength(2);
    expect(out).not.toMatch(/short form/);
  });
});
