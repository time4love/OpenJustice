import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { resolveRecordByName, type ResolvedRecord } from '../../services/corpusReads';
import { flagged, verified, type CaptureAttribution, type FlagReport } from '../../services/evidencePredicates';
import { answer, refusal, openPage, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// resolve_record({ fileHash }) — PUBLIC — docs/gf-evidence-flows.md A4.
//
// "What a stranger holding a citation needs: the record the name resolves to —
// kind, page, timestamps — RECOMPUTABLE, VERIFIED with its per-capture
// attribution, and the PUBLISHED versions that cite it, each with FLAGGED and
// its text."
//
// §5: "An outsider verifies a thesis against the corpus — the cited record
// resolves to a capture or a pair, the capture to bytes, the bytes to the
// registry and to the archive." This is that first hop, and it is the only tool
// here that takes a name rather than a page.
//
// A NAME RESOLVES THROUGH THE CORPUS, NOT THROUGH THE EVIDENCE TABLE. A record's
// name is derivable before anyone promotes anything (§2, §4), which is what lets
// a draft cite first and argue after; so an unpromoted record resolves too, and
// its `evidence` half is simply absent.
//
// THE CHAIN IS ASKED HERE, BOUNDED BY THE RECORD — one capture, or two. That is
// what makes this tool safely open where a whole timeline would not be.
// ---------------------------------------------------------------------------

export const resolveRecordSchema = {
  fileHash: z
    .string()
    .describe("The record's name — the 0x-prefixed hash a thesis cites as #ev_<fileHash>"),
};

interface Citation {
  thesisId: string;
  versionId: string;
  contentHash: string;
  pin: string | null;
  flagged: FlagReport;
  text: string;
}

interface Resolved {
  fileHash: string;
  kind: 'CAPTURE' | 'DIFF';
  page: { url: string; public: boolean };
  record: { capture: string } | { before: string; after: string };
  recomputable: boolean;
  verified: { verified: boolean; captures: CaptureAttribution[] } | { notEvaluable: string };
  citedBy: Citation[];
}

/** The record's endpoints by their archive names — a capture, or the pair, never a row id. */
function recordNames(resolved: ResolvedRecord): { capture: string } | { before: string; after: string } {
  if (resolved.capture !== null) return { capture: resolved.capture.capture };
  if (resolved.pair !== null) {
    return { before: resolved.pair.before.capture, after: resolved.pair.after.capture };
  }
  throw new Error(
    `resolve_record: ${resolved.fileHash} resolved to neither a capture nor a pair. A record is ` +
      'one or the other (evidence A1); this is a defect in the resolution, not an answerable state.',
  );
}

export async function resolveRecordHandler(input: { fileHash: string }): Promise<string> {
  return answer(async (): Promise<Resolved | Refusal> => {
    const resolved = await resolveRecordByName(input.fileHash);
    if (resolved === null) {
      return refusal(
        'NOT_A_RECORD',
        `${input.fileHash} names nothing the corpus holds. A record's name is composed from the ` +
          "page's URL, the capture's archive timestamp and the SHA-256 of the bytes as served, so " +
          'a name this platform cannot resolve is either a name from another corpus or a name ' +
          'nothing ever had.',
      );
    }

    const access = await openPage(resolved.page);
    if (access.refused !== null) return access.refused;

    const report = await verified(resolved.fileHash);
    const mentions = await prisma.thesisMention.findMany({
      where: {
        kind: 'EVIDENCE',
        name: resolved.fileHash,
        thesisVersion: { isPublished: { isNot: null } },
      },
      select: {
        id: true,
        contentVersionHash: true,
        thesisVersion: { select: { id: true, thesisId: true, contentHash: true, text: true } },
      },
    });

    const citedBy: Citation[] = [];
    for (const mention of mentions) {
      citedBy.push({
        thesisId: mention.thesisVersion.thesisId,
        versionId: mention.thesisVersion.id,
        contentHash: mention.thesisVersion.contentHash,
        pin: mention.contentVersionHash,
        flagged: await flagged(mention.id),
        // THE VERSION'S TEXT, AS IT IS — thesis A2 :1273: Markdown with citation
        // tokens is the record, so what a reader of a citation sees is what the
        // author wrote, `#ev_…` tokens included, and no renderer stands between.
        text: mention.thesisVersion.text,
      });
    }

    return {
      fileHash: resolved.fileHash,
      kind: resolved.kind,
      page: { url: resolved.page.url, public: access.public },
      record: recordNames(resolved),
      // RECOMPUTABLE IS A PROPERTY OF THE ROW WHERE THERE IS ONE, and of the
      // resolution only where there is not.
      //
      // The two can disagree, and that disagreement is the whole reason to
      // report the row's answer: a `fileHash` can be a VALID name — of some
      // record the corpus holds — while the row's key points at a DIFFERENT
      // record. The name then resolves through the corpus perfectly well, and
      // reporting `true` from that resolution would publish a verified block
      // computed over the row's captures beside a name that is not theirs.
      // "A row that fails it is MALFORMED, never stale."
      //
      // With no evidence row there is nothing to be malformed: the name was
      // reproduced from the record it names (`corpusReads.searchPage` asks the
      // same predicate), and a name that could not be reproduced refuses
      // NOT_A_RECORD above rather than arriving here.
      recomputable: report.evaluable ? report.recomputable : true,
      verified: report.evaluable
        ? { verified: report.verified, captures: report.captures }
        : { notEvaluable: report.reason },
      citedBy,
    };
  });
}
