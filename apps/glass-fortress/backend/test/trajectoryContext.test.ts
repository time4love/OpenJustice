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
  prisma: { evidence: { findMany: jest.fn() } },
}));
jest.mock('../src/services/claimTrajectory', () => {
  const actual = jest.requireActual('../src/services/claimTrajectory');
  return { ...actual, getClaimTrajectories: jest.fn() };
});

import { prisma } from '../src/lib/prisma';
import { getClaimTrajectories, claimHash, normaliseClaim } from '../src/services/claimTrajectory';
import { loadTrajectoryContext, formatTrajectoryContext } from '../src/lib/trajectoryContext';

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
    expect(await loadTrajectoryContext([])).toEqual({ trajectories: [], coverage: [], omittedGroups: 0 });
    expect(prisma.evidence.findMany).not.toHaveBeenCalled();
  });

  it('loads trajectories for the tracked page the evidence came from', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);

    const { trajectories } = await loadTrajectoryContext([{ fileHash: '0xaaa' }]);

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
    ]);

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

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xmixed' }]);

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

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xnested' }]);

    expect(coverage[0].itemsInTrajectories).toBe(1);
    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('matches containment in both directions', async () => {
    (getClaimTrajectories as jest.Mock).mockResolvedValue({ groups: [groupOf([LONG_FORM])] });
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xshorter', [item(SHORT_FORM, true)]),
    ]);

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xshorter' }]);

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

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xshort' }]);

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

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xboth' }]);

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

    const { coverage } = await loadTrajectoryContext([{ fileHash: '0xpageA' }, { fileHash: '0xpageB' }]);

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

    const { trajectories, coverage, omittedGroups } = await loadTrajectoryContext([{ fileHash: '0xlate' }]);

    expect(trajectories).toHaveLength(8); // display cap honoured
    expect(omittedGroups).toBe(4); // and reported, never silent
    expect(coverage[0].itemsInTrajectories).toBe(1);
    expect(coverage[0].independentSignificantItems).toBe(0);
  });

  it('contributes nothing for evidence that was never archived over time', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);

    expect(await loadTrajectoryContext([{ fileHash: '0xarticle' }])).toEqual({
      trajectories: [],
      coverage: [],
      omittedGroups: 0,
    });
    expect(getClaimTrajectories).not.toHaveBeenCalled();
  });

  it('does not let one unscanned page break a corpus drawn from several', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      evidenceRow('0xaaa', [item(FOLLOWED, true)]),
    ]);
    (getClaimTrajectories as jest.Mock).mockRejectedValue(new Error('No tracked URL found'));

    const bundle = await loadTrajectoryContext([{ fileHash: '0xaaa' }]);
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
      },
    ],
    coverage: [
      { fileHash: '0xmixed', totalItems: 14, itemsInTrajectories: 8, independentSignificantItems: 6 },
    ],
    omittedGroups: 0,
  };

  it.each(['en', 'he'] as const)('marks omitted groups rather than dropping them silently in %s', (lang) => {
    // A truncated set makes a partial answer look complete. The note also has to
    // say the omission is display-only, or a reader discounts the coverage counts.
    const out = formatTrajectoryContext({ ...bundle, omittedGroups: 7 }, lang);
    expect(out).toContain('7');
    expect(out).toMatch(lang === 'en' ? /display only/ : /בתצוגה בלבד/);
  });

  it('renders nothing when there are no trajectories', () => {
    const empty = { trajectories: [], coverage: [], omittedGroups: 0 };
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
