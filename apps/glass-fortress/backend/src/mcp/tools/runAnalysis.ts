import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asJsonColumn } from '../../lib/jsonColumn';
import { isUniqueViolation } from '../../lib/uniqueViolation';
import { critiqueMaterial, headFingerprint } from '../../services/criticMaterial';
import { auditCritique, type AuditedCritique } from '../../services/thesisCriticAudit';
import { critique, THESIS_CRITIC_MODEL } from '../../services/thesisCritic';
import { CRITIC_PROMPT_VERSION, currentAnalysis } from '../../services/thesisPredicates';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// run_analysis({ thesisId })
// WRITE · PAID, ONCE — docs/gf-thesis-flows.md T4 :580–:614, A4 :1481–:1486.
//
// "FINGERPRINT(head) · → the critic · AUDITS · appends ThesisAnalysis." The refusal order is `test/thesis/contract.ts`
// TOOLS':
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · NO_HEAD · ANALYSIS_CURRENT · AWAITING_DERIVATION
//
// NO_HEAD IS THE FLOW'S (T4 :583; the flows win). ANALYSIS_CURRENT AND AWAITING_DERIVATION ARE DECIDED FROM ONE
// COMPUTATION (R48 D1): an undefined fingerprint can match no analysis, so the defined check comes first and the order
// is observably the contract's.
//
// NOTHING IS SPENT TWICE ON THE SAME QUESTION (A2 :1318). ANALYSIS_CURRENT is decided BEFORE the draw; and where two
// calls race past it, the create meets `@@unique([versionId, inputFingerprint])` and the loser refuses ANALYSIS_CURRENT
// saying that its draw was spent and not recorded (R48 §6-8). No transaction: the draw sits between a read and ONE
// write, and a transaction around a paid model call would hold a window open for its length.
//
// THE HALF-STATE: a draw that throws — a provider error, a critique that fails its parse — writes nothing, and is not
// retried (R48 §6-R25).
// ---------------------------------------------------------------------------

export const runAnalysisSchema = {
  thesisId: z.string().describe('The thesis whose HEAD version the critic reads — yours'),
};

export interface RunAnalysisInput {
  thesisId: string;
}

interface RunAnalysisAnswer {
  analysisId: string;
  inputFingerprint: string;
  opinion: AuditedCritique;
  suggestedGaps: { gapId: string | null; description: string; document: string; holder: string }[];
}

export async function runAnalysisHandler(input: RunAnalysisInput): Promise<string> {
  return answer(async (): Promise<RunAnalysisAnswer | Refusal> => {
    const researcher = requireResearcher('Running the critic');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, createdById: true, headVersionId: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal(
        'NOT_AUTHOR',
        `Thesis ${thesis.id} is not yours. The critic is run by a thesis's author; any researcher may read its analysis ` +
          'with get_thesis_context.',
      );
    }
    if (thesis.headVersionId === null) {
      return refusal('NO_HEAD', `Thesis ${thesis.id} has no version yet, so there is nothing for the critic to read.`);
    }

    const headed = await headFingerprint(thesis.id, thesis.headVersionId);
    if (!headed.defined) {
      return refusal(
        'AWAITING_DERIVATION',
        `The head cites ${headed.named}, which has no current content version: its endpoints' text has moved and the ` +
          'walk owes a re-derivation. The critic is never handed content that does not exist — run scan_captures on ' +
          'that page, then run the analysis. Nothing was spent.',
      );
    }

    const analyses = await prisma.thesisAnalysis.findMany({ where: { versionId: thesis.headVersionId } });
    const current = currentAnalysis(thesis.headVersionId, analyses, headed.fingerprint);
    if (current !== null) {
      return refusal(
        'ANALYSIS_CURRENT',
        `Analysis ${current.id} already read exactly this input — the head's text, its citations' current content, the ` +
          'gap decisions and the critic prompt are all unchanged since. Nothing was spent. Read it with ' +
          'get_thesis_context; change the version or decide a gap, and the analysis is stale.',
      );
    }

    const material = await critiqueMaterial(headed.head);

    // THE PAID DRAW — once, outside any transaction, after every refusal.
    const opinion = auditCritique({ ...material, critique: await critique(material) });

    let analysisId: string;
    try {
      const row = await prisma.thesisAnalysis.create({
        data: {
          versionId: thesis.headVersionId,
          inputFingerprint: headed.fingerprint,
          opinion: asJsonColumn(opinion),
          model: THESIS_CRITIC_MODEL(),
          promptVersion: CRITIC_PROMPT_VERSION,
          // A PAID ACT RECORDS WHO SPENT IT — thesis A2 :1317 as amended 2026-09-14 (thesis step 23).
          researcherId: researcher.researcherId,
        },
        select: { id: true },
      });
      analysisId = row.id;
    } catch (err) {
      if (!isUniqueViolation(err, ['versionId', 'inputFingerprint'])) throw err;
      return refusal(
        'ANALYSIS_CURRENT',
        'Another run of the critic recorded an analysis of exactly this input while this one was drawing. That analysis ' +
          'stands; THIS call\'s draw was spent and its critique was not recorded. Read the recorded one with ' +
          'get_thesis_context.',
      );
    }

    return {
      analysisId,
      inputFingerprint: headed.fingerprint,
      opinion,
      suggestedGaps: opinion.suggestedGaps.map((g) => ({
        gapId: g.gapId,
        description: g.description,
        document: g.document,
        holder: g.holder,
      })),
    };
  });
}
