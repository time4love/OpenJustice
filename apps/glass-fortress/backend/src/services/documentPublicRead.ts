import type { DocumentOpening, PassageVerdictValue } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { documentsByCommitment, type CitedDocument } from './documentCitation';
import { capturesEqualTo } from './documentCaptures';
import { openingsOf } from './documentOpenings';
import { publicStandingOf, type PublicStanding } from './documentStanding';
import { argued, flaggedFor, type FlagReport } from './evidencePredicates';
import { decisionsAtPublication, gapInForce } from './thesisPredicates';

// ---------------------------------------------------------------------------
// WHAT THE PUBLIC READS OF A DOCUMENT — docs/gf-document-flows.md §7 :844–:864, §9 :1028–:1035 as CONFORMED 2026-09-26
// (R85 Q-E), A4 :1465–:1467; document plan step 34 :277–:279; the researcher's Q-A (R85).
//
// THE ONE COMPOSER of §7's block, and the ONE public module that reaches the chain. `resolve_record` answers a
// commitment with the block, the public thesis page carries it on each DOCUMENT citation, and `list_findings`' register
// is composed from it — three doors, one composition, so no two can tell a stranger different things about a document.
// It is NOT imported by any research act, and cannot be: it asks the chain (`test/researchActsReachNoChain.test.ts`'s
// third control names its importers).
//
// A BLOCK EXISTS ONLY FOR A PUBLIC DOCUMENT — PUBLIC(d) = OPENED(d) is defined (A3 :1379), read through
// `documentOpenings.openingsOf`, THE loader, never re-derived. A document no published version opened is ABSENT from
// every answer here, and each door says so in its own word (`NOT_PUBLIC`, or no register row).
//
// WHAT IT NEVER CARRIES (§7 :859–:860; the researcher's Q10): the OPINION (no `DocumentOpinion` is read here), DOC_ID or
// the salt — EVEN AT BYTES; they ride `/bytes` alone (A5 :1509–:1510) — any other document of the same arrival, the
// arrival, anything about a sender. `test/documentPublicBlock.test.ts` holds each, as a key AND as a value.
//
// THE WORDS RIDE THE WIRE (the researcher's M2, R85): §7 :863 serves this block through `resolve_record`, which no
// frontend renders, so each code carries the design's words VERBATIM beside it — §4 :466–:468 by mode, §7 :856–:858 for
// the sealed notice. The page's Hebrew is the frontend change's (plan :280–:282).
//
// COST: every Prisma read below is PLURAL — one query per kind, whatever the number of documents or citations
// (`test/thesis/publishedBodyCost.test.ts`). The chain and the bucket are read per document (`publicStandingOf`): the
// researcher's recorded LOW (Q-A), measured at §12.
// ---------------------------------------------------------------------------

/** §4 :466, VERBATIM by mode — what VERIFIED says for a document. */
export const VERIFIED_SAYS = {
  HELD: 'the bytes the platform holds hash to the name, now; a third party timestamped a commitment to it',
  SEALED:
    'the platform verified the name once, at receipt, and committed to it on chain by that block; a key holder could re-verify, if §5 gives it one',
} as const;

/**
 * §4 :467, VERBATIM by mode — what it does NOT say. The SEALED cell reads "the same — and …", pointing at the HELD cell,
 * so SEALED carries BOTH cells as the table reads them — never a sentence composed from them (R85 [R1-4], suppressed).
 */
export const VERIFIED_DOES_NOT_SAY = {
  HELD: ['that the bytes are authentic, complete, unaltered, or from whom'],
  SEALED: ['that the bytes are authentic, complete, unaltered, or from whom', 'the same — and that the platform can check anything again'],
} as const;

/** §4 :468, VERBATIM by mode — the second witness, stated and never implied (§7 :850). */
export const SECOND_WITNESS = {
  HELD: 'none — the archive is absent, and the flag reads so',
  SEALED: 'none',
} as const;

/** §7 :856–:858, VERBATIM — the notice a SEALED document always carries: a fixed field by custody, never per assertion. */
export const SEALED_NOTICE =
  "the platform derived this text once, at receipt; nothing can derive it again, and what the thesis says of the document's appearance rests on a model's reading the platform cannot repeat";

/** One published version citing the document, as the block serves it (§7 :851–:855). */
export interface CitingVersion {
  thesisId: string;
  versionId: string;
  /** The pinned content version's hash — the document's commitment where the content is the bytes (A1 :1243). */
  pin: string;
  /** The verdicts WRITTEN at publication — a STAMP, and the field says so (A3 :1389–:1391; A2 :1313). */
  passages: { stamp: 'PUBLICATION'; rows: { phrase: string; verdict: PassageVerdictValue; at: string }[] };
  /** Each gap this citation answers that was REQUESTED first: the request beside the answer (§7 :853, §1). */
  requests: { gapId: string; request: unknown }[];
  argued: boolean;
  /** The FACT that the citation was promoted over the debate assessor's objection — never the objection (T5 :816). */
  overObjection: boolean;
  flag: { flagged: boolean; reasons: readonly string[] };
}

/** Document flows §7 :848–:858's block. */
export interface DocumentBlock {
  kind: 'DOCUMENT';
  commitment: string;
  title: string | null;
  custody: 'HELD' | 'SEALED';
  /** The entry that attests the document — its registry index and block time (§7 :848–:849); a capture where it attests. */
  registry:
    | { attestedBy: 'COMMITMENT' | 'CAPTURE' | null; registryIndex: number | null; blockTime: string | null; capture: { url: string; capture: string } | null }
    | { unavailable: 'CHAIN_UNAVAILABLE' };
  /** How the identity was last verified and when (§7 :849; §4's table verbatim by mode; the researcher's Q-B). */
  verification: { mode: 'HELD' | 'SEALED'; verified: boolean; at: string; says: string; doesNotSay: readonly string[] };
  secondWitness: { code: 'NONE'; words: string };
  opening: DocumentOpening;
  citedBy: CitingVersion[];
  /** Present iff custody is SEALED (§7 :856–:858). */
  notice?: { code: 'SEALED_DERIVED_ONCE'; words: string };
}

/** A row of `list_findings`' `documents` register — §9 :1031–:1033 as CONFORMED 2026-09-26 (R85 Q-E). */
export interface RegisterRow {
  commitment: string;
  title: string | null;
  /** The researcher's assertion, LABELLED as theirs (§9 :1031) — ONE shape with read_document's (A4 :1434). */
  assertions: { assertedAt: string | null };
  custody: 'HELD' | 'SEALED';
  anchored: boolean;
  content: { contentVersionHash: string } | { awaiting: 'AWAITING_DERIVATION' };
  equalsCapture: { url: string; capture: string } | null;
  opening: DocumentOpening;
  citedBy: { thesisId: string; published: true }[];
}

/** A mention on a PUBLISHED version naming a public document, as the loader reads it. */
interface CitingMention {
  id: string;
  name: string;
  versionId: string;
  contentVersionHash: string | null;
  thesisVersion: { thesisId: string };
  debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
}

/** What `blockOf` composes a block from — every row already read; it makes no query. */
export interface BlockRows {
  cited: CitedDocument;
  opening: DocumentOpening;
  standing: PublicStanding;
  citing: readonly CitingMention[];
  verdicts: ReadonlyMap<string, { phrase: string; verdict: PassageVerdictValue; at: Date }[]>;
  flags: ReadonlyMap<string, FlagReport>;
  requests: ReadonlyMap<string, { gapId: string; request: unknown }[]>;
}

/**
 * THE ONE COMPOSER — PURE, over rows already read. Every field is §7's and named there; nothing else is added, and what
 * §7 :859–:860 forbids is never read, so it cannot be composed.
 */
export function blockOf(rows: BlockRows): DocumentBlock {
  const { cited, opening, standing } = rows;
  const { document } = cited;
  if (cited.custody === 'NONE') {
    // SHED is document step 35's: nothing writes a Shed row before it, so a public block over one is a world no clause
    // creates yet — a loud guard, never a block that says nothing about it.
    throw new Error(`documentPublicRead: ${document.commitment} was SHED — what the public reads of a shed document is document step 35's.`);
  }
  const mode = cited.custody;
  const at = mode === 'SEALED' ? document.verifiedAtReceipt : standing.at;
  if (at === null) {
    throw new Error(`documentPublicRead: sealed document ${document.commitment} carries no verifiedAtReceipt — the receipt stamps every sealed row (§2 :219–:221).`);
  }
  const block: DocumentBlock = {
    kind: 'DOCUMENT',
    commitment: document.commitment,
    title: document.title,
    custody: mode,
    registry:
      'unavailable' in standing
        ? { unavailable: standing.unavailable }
        : {
            attestedBy: standing.attestation.attestedBy,
            registryIndex: standing.attestation.entry.registryIndex,
            blockTime: standing.attestation.entry.blockTime,
            // The page and capture ONLY — never the entry's hash, which for a capture-attested document IS its DOC_ID.
            capture: standing.attestation.capture === null ? null : { url: standing.attestation.capture.url, capture: standing.attestation.capture.capture },
          },
    verification: { mode, verified: standing.verified, at: at.toISOString(), says: VERIFIED_SAYS[mode], doesNotSay: VERIFIED_DOES_NOT_SAY[mode] },
    secondWitness: { code: 'NONE', words: SECOND_WITNESS[mode] },
    opening,
    citedBy: [...rows.citing]
      .sort((a, b) => a.thesisVersion.thesisId.localeCompare(b.thesisVersion.thesisId) || a.versionId.localeCompare(b.versionId))
      .map((mention) => citingVersion(mention, rows)),
  };
  return mode === 'SEALED' ? { ...block, notice: { code: 'SEALED_DERIVED_ONCE', words: SEALED_NOTICE } } : block;
}

function citingVersion(mention: CitingMention, rows: BlockRows): CitingVersion {
  const pin = mention.contentVersionHash;
  const flag = rows.flags.get(mention.id);
  if (pin === null || flag === undefined) {
    throw new Error(`documentPublicRead: the citation ${mention.id} carries no pin or no FLAGGED — the version write pins every document, and flaggedFor answers every id asked.`);
  }
  const thesisId = mention.thesisVersion.thesisId;
  return {
    thesisId,
    versionId: mention.versionId,
    pin,
    passages: {
      stamp: 'PUBLICATION',
      rows: (rows.verdicts.get(mention.id) ?? []).map((v) => ({ phrase: v.phrase, verdict: v.verdict, at: v.at.toISOString() })),
    },
    requests: rows.requests.get(mention.id) ?? [],
    argued: argued({ name: mention.name, thesisId, debate: mention.debateSession }),
    overObjection: mention.debateSession?.promotedOverObjection === true,
    flag: { flagged: flag.flagged, reasons: flag.reasons },
  };
}

/** A public document's block, and the loaded document it was composed from — the register reads both. */
interface PublicDocument {
  cited: CitedDocument;
  block: DocumentBlock;
}

/**
 * THE ONE LOADER — every PUBLIC document among `commitments`, each with its block. An absent key is a name no document
 * holds, or a document no published version opened: the loader does not say which, and neither does any public door.
 * PLURAL THROUGHOUT: one read per kind (documents, openings, mentions, verdicts, flags, gap decisions, versions),
 * then the chain per document.
 */
async function loadPublic(commitments: readonly string[]): Promise<Map<string, PublicDocument>> {
  const answers = new Map<string, PublicDocument>();
  const wanted = [...new Set(commitments)];
  if (wanted.length === 0) return answers;
  const [documents, openings] = await Promise.all([documentsByCommitment(wanted), openingsOf(wanted)]);
  const open = new Map<string, { cited: CitedDocument; opening: DocumentOpening }>();
  for (const [commitment, cited] of documents) {
    const opening = openings.get(commitment)?.opened ?? null;
    if (opening !== null) open.set(commitment, { cited, opening });
  }
  if (open.size === 0) return answers;

  const names = [...open.keys()];
  // THE PUBLISHED VERSIONS THAT CITE IT — the pin, as `resolve_record` reads a capture's (evidence A4 :1107–:1108,
  // `resolveRecord.ts`): a withdrawn or superseded version's text is not served, so neither are its quoted passages.
  const citing: CitingMention[] = await prisma.thesisMention.findMany({
    where: { kind: 'DOCUMENT', name: { in: names }, thesisVersion: { isPublished: { isNot: null } } },
    select: {
      id: true,
      name: true,
      versionId: true,
      contentVersionHash: true,
      thesisVersion: { select: { thesisId: true } },
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true, promotedOverObjection: true } },
    },
  });
  const mentionIds = citing.map((m) => m.id);
  const theses = [...new Set(citing.map((m) => m.thesisVersion.thesisId))];
  const [verdictRows, flags, decisions, versions, standings] = await Promise.all([
    mentionIds.length === 0
      ? Promise.resolve([])
      : prisma.passageVerdict.findMany({ where: { mentionId: { in: mentionIds } }, select: { mentionId: true, phrase: true, verdict: true, at: true } }),
    flaggedFor(mentionIds),
    theses.length === 0 ? Promise.resolve([]) : prisma.thesisGapDecision.findMany({ where: { thesisId: { in: theses } } }),
    theses.length === 0 ? Promise.resolve([]) : prisma.thesisVersion.findMany({ where: { thesisId: { in: theses } }, select: { id: true, parentVersionId: true } }),
    publicStandingOf(new Map([...open].map(([commitment, { cited }]) => [commitment, cited]))),
  ]);

  const verdicts = new Map<string, { phrase: string; verdict: PassageVerdictValue; at: Date }[]>();
  for (const row of [...verdictRows].sort((a, b) => a.at.getTime() - b.at.getTime() || a.phrase.localeCompare(b.phrase))) {
    verdicts.set(row.mentionId, [...(verdicts.get(row.mentionId) ?? []), { phrase: row.phrase, verdict: row.verdict, at: row.at }]);
  }

  // A REQUEST ON RECORD (§7 :853): at each citing publication, a gap whose decision IN FORCE is CITED on this
  // document and which, at or before that publication, was REQUESTED — the latest such request, beside the answer.
  const requests = new Map<string, { gapId: string; request: unknown }[]>();
  for (const mention of citing) {
    const thesisId = mention.thesisVersion.thesisId;
    const atPublication = decisionsAtPublication(decisions.filter((d) => d.thesisId === thesisId), versions, mention.versionId);
    const answered: { gapId: string; request: unknown }[] = [];
    for (const gapId of [...new Set(atPublication.map((d) => d.gapId))].sort()) {
      const inForce = gapInForce(atPublication, thesisId, gapId);
      if (inForce?.decision !== 'CITED' || inForce.citedName !== mention.name) continue;
      const requested = atPublication
        .filter((d) => d.gapId === gapId && d.decision === 'REQUESTED' && d.sequence < inForce.sequence)
        .sort((a, b) => b.sequence - a.sequence)
        .at(0);
      if (requested !== undefined) answered.push({ gapId, request: requested.request });
    }
    requests.set(mention.id, answered);
  }

  for (const [commitment, { cited, opening }] of open) {
    const standing = standings.get(commitment);
    if (standing === undefined) {
      throw new Error(`documentPublicRead: publicStandingOf answered nothing for ${commitment} — it answers every document asked.`);
    }
    const block = blockOf({ cited, opening, standing, citing: citing.filter((m) => m.name === commitment), verdicts, flags, requests });
    answers.set(commitment, { cited, block });
  }
  return answers;
}

/** §7's block for every PUBLIC document among `commitments`, keyed by commitment — the public page's DOCUMENT arm. */
export async function documentBlocks(commitments: readonly string[]): Promise<Map<string, DocumentBlock>> {
  return new Map([...(await loadPublic(commitments))].map(([commitment, { block }]) => [commitment, block]));
}

/**
 * `resolve_record`'s commitment arm (A4 :1466–:1467; §7 :863–:864): the block, `NOT_PUBLIC` for a document no published
 * version opened, or null for a name no document holds — which the caller answers `NOT_A_RECORD` (evidence A4 :1109).
 */
export async function documentRecordOf(commitment: string): Promise<DocumentBlock | 'NOT_PUBLIC' | null> {
  if (!(await documentsByCommitment([commitment])).has(commitment)) return null;
  return (await loadPublic([commitment])).get(commitment)?.block ?? 'NOT_PUBLIC';
}

/**
 * `list_findings`' `documents` register (A4 :1465; §9 :1031–:1035 as CONFORMED): every OPENED document asserting this
 * page — nothing unopened, for anyone. Composed from the block, so the register and the block never disagree.
 */
export async function documentRegister(url: string): Promise<RegisterRow[]> {
  const asserting = await prisma.document.findMany({ where: { assertedUrl: url }, select: { commitment: true } });
  const loaded = await loadPublic(asserting.map((d) => d.commitment));
  const rows: RegisterRow[] = [];
  for (const [commitment, { cited, block }] of [...loaded].sort(([a], [b]) => a.localeCompare(b))) {
    const { document, current } = cited;
    if ('shed' in current) {
      throw new Error(`documentPublicRead: ${commitment} reached the register SHED — the block refuses it first.`);
    }
    rows.push({
      commitment,
      title: block.title,
      assertions: { assertedAt: document.assertedAt === null ? null : document.assertedAt.toISOString().slice(0, 10) },
      custody: block.custody,
      anchored: 'attestedBy' in block.registry && block.registry.attestedBy !== null,
      content: 'awaiting' in current ? { awaiting: 'AWAITING_DERIVATION' } : { contentVersionHash: current.contentVersionHash },
      equalsCapture: block.custody === 'HELD' ? await capturesEqualTo(document.docId) : null,
      opening: block.opening,
      citedBy: [...new Set(block.citedBy.map((c) => c.thesisId))].map((thesisId) => ({ thesisId, published: true as const })),
    });
  }
  return rows;
}
