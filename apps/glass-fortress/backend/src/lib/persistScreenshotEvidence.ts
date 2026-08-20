import { prisma } from './prisma';
import { upsertKeyFigures } from './upsertKeyFigures';
import { buildEvidenceAnalysisData } from './evidenceCreateData';
import { Web3Service } from '../services/Web3Service';
import { StorageService } from '../services/StorageService';
import type { IntakeOutput } from '../services/IntakeAgent';

function getStorageService(): StorageService {
  return new StorageService();
}

export interface PersistScreenshotEvidenceInput {
  // Order matters — reading order. Combined fileHash is order-dependent, and
  // the first image becomes fileUrl, the rest become additionalScreenshotUrls.
  images: { buffer: Buffer; mimeType: string }[];
  analysis: IntakeOutput;
  // The failed/blocked URL — asserted provenance, never fetched here.
  sourceUrl: string;
  // null for anonymous/public submissions.
  createdById: string | null;
}

export interface PersistedEvidenceResult {
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
  fileUrl: string;
  additionalScreenshotUrls: string[];
  message: string;
}

/**
 * Shared persistence core for screenshot-based evidence recovery. Always
 * saves PENDING_REVIEW — the paired sourceUrl is an asserted, unfetched
 * claim regardless of caller, same rule that already governs
 * createEvidenceFromText. No on-chain registration, no vector-store upsert:
 * those only happen once a human reviewer promotes the record.
 *
 * Every image is uploaded to Storage before the Evidence row is created — if
 * any upload fails, this throws before create() is ever reached, so no row
 * with a partially-uploaded image set can be persisted.
 */
export async function persistScreenshotEvidence(
  input: PersistScreenshotEvidenceInput,
): Promise<PersistedEvidenceResult> {
  const { images, analysis, sourceUrl, createdById } = input;
  if (images.length === 0) {
    throw new Error('persistScreenshotEvidence requires at least one image.');
  }

  const fileHash = Web3Service.hashFile(Buffer.concat(images.map((img) => img.buffer)));

  const existing = await prisma.evidence.findUnique({ where: { fileHash } });
  if (existing) {
    return {
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
      sourceUrl,
      fileUrl: existing.fileUrl ?? '',
      additionalScreenshotUrls: existing.additionalScreenshotUrls,
      message: `Evidence already exists with status ${existing.status}. No duplicate created.`,
    };
  }

  await upsertKeyFigures(analysis.keyFigures);

  const storage = getStorageService();
  const uploadedUrls = await Promise.all(
    images.map((image, index) => {
      const ext = image.mimeType === 'image/png' ? 'png' : 'jpg';
      return storage.uploadEvidenceFile(image.buffer, `screenshot-${index}.${ext}`, image.mimeType);
    }),
  );
  const [fileUrl, ...additionalScreenshotUrls] = uploadedUrls as [string, ...string[]];

  const record = await prisma.evidence.create({
    data: {
      fileHash,
      status: 'PENDING_REVIEW',
      ...buildEvidenceAnalysisData(analysis),
      figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
      sourceUrl,
      fileUrl,
      additionalScreenshotUrls,
      ...(createdById ? { createdById } : {}),
    },
    include: { figures: { select: { name: true } } },
  });

  return {
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
    sourceUrl,
    fileUrl: record.fileUrl ?? '',
    additionalScreenshotUrls: record.additionalScreenshotUrls,
    message:
      'Evidence saved as PENDING_REVIEW. It will NOT appear in the public vault or be registered on-chain until a human reviewer promotes it via the UI.',
  };
}
