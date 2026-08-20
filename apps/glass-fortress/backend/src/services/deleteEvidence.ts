import type { Evidence } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { StorageService } from './StorageService';

let _storage: StorageService | null = null;

function getStorage(): StorageService {
  if (!_storage) _storage = new StorageService();
  return _storage;
}

export interface DeleteEvidenceResult {
  deleted: boolean;
  evidenceId: string;
  fileHash: string;
  message: string;
}

/**
 * Permanently delete a PENDING_REVIEW evidence record — the file(s) in
 * Storage, then the Prisma row. Refuses anything CONFIRMED: once a fileHash
 * is registered on-chain, the record is meant to be immutable — deleting
 * the DB row would leave a permanent, unrecoverable mismatch with the chain
 * (see [[feedback-evidentiary-proof-standard]]). Also refuses a record
 * still cited by a thesis: ThesisMention.refId is a plain string reference,
 * not a real foreign key, so deleting the Evidence row underneath an
 * existing citation would silently leave it dangling.
 *
 * Also refuses a record with a non-null ipfsCid: that field is only ever set by the
 * separate whistleblower/thesis-attachment path (EphemeralAnalysisService.ts's
 * Pinata upload) — never by this feature or any other Evidence-creation call
 * site. There is no verified Pinata delete/unpin implementation yet, and even
 * unpinning would not guarantee the content is unreachable if another IPFS
 * node has it cached — deleting the DB row while silently leaving that pin in
 * place would be worse than refusing outright.
 *
 * Shared by the delete_evidence MCP tool — no REST route: this is an
 * admin/researcher cleanup action, not something the public site exposes.
 */
export async function deleteEvidence(record: Evidence): Promise<DeleteEvidenceResult> {
  if (record.status !== 'PENDING_REVIEW') {
    return {
      deleted: false,
      evidenceId: record.id,
      fileHash: record.fileHash,
      message: `Refusing to delete: status is ${record.status}, not PENDING_REVIEW. Once evidence is ` +
        'CONFIRMED and registered on-chain, its record is immutable — deleting it here would leave a ' +
        'permanent mismatch with the blockchain.',
    };
  }

  if (record.ipfsCid) {
    return {
      deleted: false,
      evidenceId: record.id,
      fileHash: record.fileHash,
      message: `Refusing to delete: this record has an IPFS pin (ipfsCid: ${record.ipfsCid}) from the ` +
        'whistleblower attachment path. There is no verified Pinata unpin implementation yet — deleting ' +
        'the database row without handling the pin would leave it silently orphaned. Needs manual handling.',
    };
  }

  const citingCount = await prisma.thesisMention.count({
    where: { type: 'EVIDENCE', refId: record.fileHash },
  });
  if (citingCount > 0) {
    return {
      deleted: false,
      evidenceId: record.id,
      fileHash: record.fileHash,
      message: `Refusing to delete: cited by ${citingCount} thesis mention(s). Remove those citations first.`,
    };
  }

  const fileUrls = [record.fileUrl, ...record.additionalScreenshotUrls].filter(
    (url): url is string => Boolean(url),
  );
  if (fileUrls.length > 0) {
    await getStorage().deleteEvidenceFiles(fileUrls);
  }

  await prisma.evidence.delete({ where: { id: record.id } });

  return {
    deleted: true,
    evidenceId: record.id,
    fileHash: record.fileHash,
    message: 'Evidence permanently deleted.',
  };
}
