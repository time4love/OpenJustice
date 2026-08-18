import { webcrypto } from 'node:crypto';
import { IntakeAgent } from './IntakeAgent';
import { StorageService } from './StorageService';

const { subtle } = webcrypto;

const IV_LENGTH = 12;

async function decryptBuffer(ciphertextB64: string, aesKeyJwk: object): Promise<Buffer> {
  const combined = Buffer.from(ciphertextB64, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);

  const key = await subtle.importKey(
    'jwk',
    aesKeyJwk as JsonWebKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return Buffer.from(plaintext);
}

function zeroBuffer(buf: Buffer): void {
  buf.fill(0);
}

async function uploadToPinata(ciphertextB64: string, filename: string): Promise<string> {
  const jwt = process.env['PINATA_JWT'];
  if (!jwt) throw new Error('PINATA_JWT not configured');

  const rawBytes = Buffer.from(ciphertextB64, 'base64');
  const formData = new FormData();
  formData.append('file', new Blob([rawBytes], { type: 'application/octet-stream' }), filename);
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pinata upload failed: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as { data?: { cid?: string }; IpfsHash?: string };
  const cid = json.data?.cid ?? json.IpfsHash;
  if (!cid) throw new Error('Pinata response missing CID');
  return cid;
}

export interface EphemeralFile {
  ciphertext: string;  // base64: IV (12 B) + AES-GCM ciphertext
  aesKey: object;      // JWK — only held for the duration of this call
  filename: string;
  mimeType: string;
}

export interface EphemeralResult {
  analysis: Awaited<ReturnType<IntakeAgent['analyzeEvidence']>>;
  ipfsCid: string | null;
  fileUrl: string | null;
}

let _intake: IntakeAgent | null = null;
let _storage: StorageService | null = null;
function getIntake(): IntakeAgent { return (_intake ??= new IntakeAgent()); }
function getStorage(): StorageService { return (_storage ??= new StorageService()); }

export async function storeEphemeral(file: Pick<EphemeralFile, 'ciphertext' | 'filename'>): Promise<Pick<EphemeralResult, 'ipfsCid' | 'fileUrl'>> {
  let ipfsCid: string | null = null;
  let fileUrl: string | null = null;

  if (process.env['PINATA_JWT']) {
    try {
      ipfsCid = await uploadToPinata(file.ciphertext, file.filename + '.enc');
    } catch (err) {
      console.warn('[ephemeral] Pinata upload failed (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  if (!ipfsCid) {
    try {
      const rawBytes = Buffer.from(file.ciphertext, 'base64');
      fileUrl = await getStorage().uploadEvidenceFile(rawBytes, file.filename + '.enc', 'application/octet-stream');
    } catch (err) {
      console.warn('[ephemeral] Storage fallback failed (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  return { ipfsCid, fileUrl };
}

export async function analyzeEphemeral(file: EphemeralFile): Promise<EphemeralResult> {
  let plaintext: Buffer | null = null;

  try {
    plaintext = await decryptBuffer(file.ciphertext, file.aesKey);
    const analysis = await getIntake().analyzeEvidence(plaintext, file.mimeType);
    const { ipfsCid, fileUrl } = await storeEphemeral(file);

    return { analysis, ipfsCid, fileUrl };
  } finally {
    if (plaintext) zeroBuffer(plaintext);
  }
}
