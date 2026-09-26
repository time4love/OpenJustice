import type { Prisma } from '@prisma/client';
import { DESCRIBE_TOO_LARGE_BYTES, familyOf, modelReadingOf } from '../lib/acceptedDocumentTypes';
import { modelFileOf } from '../lib/documentModelPart';
import { CURRENT_EXTRACTOR } from '../lib/documentExtractor';
import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { readObject } from './documentBucket';
import { recordOpinion } from './documentContentVersions';
import { describe } from './documentDescriber';
import { DERIVED_VERSION, currentVersion, custody } from './documentPredicates';
import { documentRefusal, NO_RESEARCHER, type DocumentRefusal } from './documentRefusals';
import type { OpinionRow } from './readDocument';

// ---------------------------------------------------------------------------
// describe_document — WRITE · PAID. docs/gf-document-flows.md A4 :1437-:1441 as ruled
// 2026-09-23; §3's last row (:352); plan :181.
//
// "a model reads a HELD document's bytes on the researcher's word and its reading is appended
// as the OPINION of CURRENT(d) — §3's last row; never a citation." APPENDED is literal since
// the ruling of 2026-09-23 (A2 :1302): each call adds one `DocumentOpinion` row, attributed to
// the researcher who spent it (`by = RESEARCHER`, A2 :1303), and a second reading sits beside
// the first.
//
// THE REFUSALS, IN THE ORDER THE CALL MEETS THEM, and every one refuses BEFORE anything is
// spent: NO_RESEARCHER · NOT_A_DOCUMENT · NOT_HELD (a sealed document was read once, at receipt)
// · AWAITING_DERIVATION (an opinion attaches to a version, and there is none) ·
// UNSUPPORTED_TYPE (A4 :1440-:1441 as ruled): audio and video, which no model reads, and a
// spreadsheet with no computed text — the refusal CARRYING THE REASON from its version's
// provenance, the reader FAILED or found nothing · TOO_LARGE (A4 :1440 as ruled 2026-09-23): a
// document the model would read AS ITS FILE whose stored size is above the DESCRIBER'S bound —
// refused before the bucket read, and NEVER answered by quietly reading the computed text instead,
// whose reading the opinion row would then misattribute to the file.
//
// ONE REFUSAL COMES AFTER THE DRAW — INCOMPLETE_ANSWER (A4 :1441 as ruled): the model's answer was CUT, by its
// finish reason or a missing sentinel (`documentDescriber.ts`). Nothing is written and nothing is retried, and the
// refusal says the draw was charged — the one refusal here that cannot say nothing was spent.
//
// THE MODEL IS CALLED OUTSIDE ANY TRANSACTION — a paid draw is seconds, and Prisma's window is
// five — and the one opinion writer is called inside one.
// ---------------------------------------------------------------------------

export interface DescribedDocument {
  commitment: string;
  contentVersionHash: string;
  opinion: OpinionRow;
}

export async function describeDocument(
  commitment: string,
  researcherId: string | null,
): Promise<DescribedDocument | DocumentRefusal> {
  if (researcherId === null) return NO_RESEARCHER();
  const document = await prisma.document.findUnique({ where: { commitment }, include: { versions: DERIVED_VERSION, shed: true } });
  if (document === null) return documentRefusal('NOT_A_DOCUMENT', `No document is named ${commitment}.`);
  const mode = custody(document, document.shed);
  if (mode === 'SEALED') return documentRefusal('NOT_HELD', 'A sealed document was read once, at receipt, and is never read again.');
  if (mode === 'NONE') throw new Error(`describe_document: ${commitment} is SHED — nothing is derived or read after SHED, and SHED is document step 35's`);

  const current = currentVersion(document, document.versions, CURRENT_EXTRACTOR, document.shed);
  if ('awaiting' in current || 'shed' in current) {
    return documentRefusal('AWAITING_DERIVATION', 'The document has no version under the current extractor yet — the derivation pass owes one, and a reading attaches to a version.');
  }

  const family = familyOf(document.mimeType);
  if (family === null) throw new Error(`describe_document: ${commitment} carries a type the door never accepts (${document.mimeType})`);
  const reading = modelReadingOf(family);
  if (reading === null) {
    return documentRefusal('UNSUPPORTED_TYPE', `No model reads ${family === 'AUDIO' ? 'audio' : 'video'} — nothing was spent.`);
  }
  if (reading === 'TEXT' && current.text === null) {
    const reason = current.readFailed ? 'the reader FAILED on this spreadsheet' : 'the reader found no cells in this spreadsheet';
    return documentRefusal('UNSUPPORTED_TYPE', `No model reads this document: a spreadsheet is read through its computed text, and there is none — ${reason}. Nothing was spent.`);
  }

  if (reading === 'FILE' && document.byteLength > DESCRIBE_TOO_LARGE_BYTES) {
    const served = current.text === null ? '' : ' Its computed text is still served by read_document.';
    return documentRefusal(
      'TOO_LARGE',
      `The file is ${String(document.byteLength)} bytes; the describer reads a file of at most ${String(DESCRIBE_TOO_LARGE_BYTES)} (50 MB, the model's documented limit). Nothing was spent.${served}`,
    );
  }

  const title = document.title ?? '';
  let opinion;
  if (reading === 'FILE') {
    const bytes = await readObject(document.bytes ?? document.docId);
    if (bytes === null) {
      throw new Error(`describe_document: ${commitment} is HELD and its bucket object is gone — a malformed row that document-recomputable lists`);
    }
    opinion = await describe({ title, file: modelFileOf(document.mimeType, bytes), computedText: current.text !== null });
  } else {
    opinion = await describe({ title, text: current.text ?? '' });
  }

  if ('incomplete' in opinion) {
    // A4 :1441 as ruled: NAME the finish reason and say NOTHING WAS WRITTEN — never that nothing was spent: this draw
    // was made and charged, and the opinion row that would record who paid for it does not exist. And name WHAT was
    // missing: "cut" only when the finish reason says so (REVIEW round 2's LOW).
    const { cause, finishReason } = opinion.incomplete;
    const what = {
      CUT: "The model's answer was cut",
      NO_SENTINEL: "The model's answer stopped before its last field (wholeAnswer is missing)",
      UNPARSEABLE: "The model's answer could not be parsed",
    }[cause];
    return documentRefusal(
      'INCOMPLETE_ANSWER',
      `${what} (finish reason: ${finishReason ?? 'none given'}) — nothing was written. The draw was made and charged; a reading is not retried.`,
    );
  }

  const write = (tx: Prisma.TransactionClient) => recordOpinion(tx, current.id, { by: 'RESEARCHER', researcherId }, opinion);
  const row = await prisma.$transaction(write, WRITE_TRANSACTION);
  const spender = (await prisma.researcher.findMany({ where: { id: { in: [researcherId] } }, select: { handle: true } })).at(0);
  if (spender === undefined) throw new Error(`describe_document: researcher ${researcherId} spent the reading and no such researcher exists`);
  return {
    commitment,
    contentVersionHash: current.contentVersionHash,
    opinion: {
      model: row.model,
      promptVersion: row.promptVersion,
      by: { handle: spender.handle, mine: true },
      at: row.createdAt.toISOString(),
      body: row.body,
    },
  };
}
