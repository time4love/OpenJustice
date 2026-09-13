import { z } from 'zod';
import { reviewEvidence, type Reviewed } from '../../services/reviewEvidence';
import { answer, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';
import { requireResearcher } from './openDebate';

// ---------------------------------------------------------------------------
// review_evidence({ fileHash, decision, reason?, expectedSequence }) — WRITE —
// docs/gf-evidence-flows.md §6 (Flow E3) and A4.
//
// THE ONE ACT THAT MOVES A RECORD'S STANDING. "REAFFIRM: the current version
// still supports every citing thesis's use of it. WITHDRAW: the current version
// no longer supports it, or never did; reason REQUIRED." No pass computes it and
// nothing re-affirms automatically.
//
// NO `NOT_AUTHOR`. §6 :536: the re-pin is "the thesis flows' act, done by the
// thesis's author, WHO MAY NOT BE THE REVIEWER". A review writes no thesis row,
// so any researcher reviews any record and the reviewer need not be the one who
// promoted it. Step 13's NOT_AUTHOR ruling covered writes ON a thesis.
//
// `expectedSequence` IS NOT A NUMBER THE RESEARCHER INVENTS. Every entry of
// `list_evidence_reviews` carries `decisionSequence`, and both of its `commands`
// embed it — so the command pastes as written. A compare-and-set whose expected
// value the caller cannot obtain is a parameter nobody can supply correctly.
// ---------------------------------------------------------------------------

export const reviewEvidenceSchema = {
  fileHash: z
    .string()
    .describe("The record's name, as list_evidence_reviews gives it — never a row id"),
  // A CLOSED ENUM, so an unknown value fails at the SCHEMA and needs no refusal
  // code of its own (§3a).
  decision: z
    .enum(['REAFFIRM', 'WITHDRAW'])
    .describe('REAFFIRM: the current version still carries every citing passage. WITHDRAW: it does not'),
  reason: z
    .string()
    .optional()
    .describe('REQUIRED on WITHDRAW — what a reader of the thesis that cited it will find'),
  expectedSequence: z
    .number()
    .int()
    .describe("The entry's decisionSequence, embedded in both commands the reviews list hands you"),
};

export interface ReviewToolInput {
  fileHash: string;
  decision: 'REAFFIRM' | 'WITHDRAW';
  reason?: string;
  expectedSequence: number;
}

export async function reviewEvidenceHandler(input: ReviewToolInput): Promise<string> {
  return answer(async (): Promise<Reviewed | Refusal<EvidenceWriteCode>> => {
    // THE IDENTITY FIRST, FROM MEMORY, BEFORE ANY QUERY — step 13's ruled order,
    // so an anonymous call reads nothing and cannot learn which records exist
    // from the difference between two refusals.
    const researcher = requireResearcher('Reviewing a record');
    if ('error' in researcher) return researcher;
    return reviewEvidence(input, researcher.researcherId);
  });
}
