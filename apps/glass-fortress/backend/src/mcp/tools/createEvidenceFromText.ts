import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { IntakeAgent } from '../../services/IntakeAgent';
import { getResearcherId } from '../../context/researcherContext';
import { Web3Service } from '../../services/Web3Service';
import { buildEvidenceAnalysisData } from '../../lib/evidenceCreateData';
import { upsertKeyFigures } from '../../lib/upsertKeyFigures';

function getAgent(): IntakeAgent {
  return new IntakeAgent();
}

export const createEvidenceFromTextSchema = {
  text: z.string().min(100).describe('The plain text content of the evidence (minimum 100 characters)'),
  url: z.string().url().describe('The canonical source URL — used for provenance, not fetched'),
};

export interface CreateEvidenceFromTextResult {
  evidenceId: string;
  fileHash: string;
  status: 'PENDING_REVIEW';
  summary: string;
  evidenceTier: string;
  evidenceRole: string;
  investigativeCategories: string[];
  targetEntity: string;
  evidenceDate: string;
  keyFigures: string[];
  sourceUrl: string;
  message: string;
}

export async function createEvidenceFromTextHandler(input: {
  text: string;
  url: string;
}): Promise<string> {
  const { text, url } = input;

  // Analyse with the same text path as URL submissions
  const agent = getAgent();
  const analysis = await agent.analyzeText(text, url);

  // Hash: url + text slice (identical to the HTML path in createEvidenceFromUrl)
  const fileHash = Web3Service.hashFile(Buffer.from(`${url}\n\n${text.slice(0, 40_000)}`, 'utf8'));

  // Duplicate guard
  const existing = await prisma.evidence.findUnique({ where: { fileHash } });
  if (existing) {
    const result: CreateEvidenceFromTextResult = {
      evidenceId: existing.id,
      fileHash: existing.fileHash,
      status: 'PENDING_REVIEW',
      summary: existing.summary,
      evidenceTier: existing.evidenceTier,
      evidenceRole: existing.evidenceRole,
      investigativeCategories: existing.investigativeCategories,
      targetEntity: existing.targetEntity,
      evidenceDate: existing.evidenceDate,
      keyFigures: [],
      sourceUrl: url,
      message: `Evidence already exists with status ${existing.status}. No duplicate created.`,
    };
    return JSON.stringify(result);
  }

  // Upsert KeyFigure records
  await upsertKeyFigures(analysis.keyFigures);

  // Persist as PENDING_REVIEW
  const researcherId = getResearcherId();
  const record = await prisma.evidence.create({
    data: {
      fileHash,
      status: 'PENDING_REVIEW',
      ...buildEvidenceAnalysisData(analysis),
      figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
      sourceUrl: url,
      ...(researcherId ? { createdById: researcherId } : {}),
    },
    include: { figures: { select: { name: true } } },
  });

  const result: CreateEvidenceFromTextResult = {
    evidenceId: record.id,
    fileHash: record.fileHash,
    status: 'PENDING_REVIEW',
    summary: record.summary,
    evidenceTier: record.evidenceTier,
    evidenceRole: record.evidenceRole,
    investigativeCategories: record.investigativeCategories,
    targetEntity: record.targetEntity,
    evidenceDate: record.evidenceDate,
    keyFigures: record.figures.map((f) => f.name),
    sourceUrl: url,
    message:
      'Evidence saved as PENDING_REVIEW. It will NOT appear in the public vault or be registered on-chain until a human reviewer promotes it via the UI.',
  };

  return JSON.stringify(result);
}
