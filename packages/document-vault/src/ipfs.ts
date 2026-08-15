export interface IpfsConfig {
  pinataJwt: string;
  /** Override base URL — defaults to Pinata public gateway. */
  gatewayUrl?: string;
}

const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files';
const PINATA_GATEWAY_DEFAULT = 'https://gateway.pinata.cloud/ipfs';

/**
 * Upload an encrypted blob to IPFS via Pinata.
 * Returns the content identifier (CID) — a stable fingerprint of the data.
 */
export async function uploadToIPFS(ciphertext: Uint8Array, config: IpfsConfig): Promise<string> {
  const blob = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });
  const form = new FormData();
  form.append('file', blob, 'encrypted.bin');

  const response = await fetch(PINATA_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.pinataJwt}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Pinata upload failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as { data?: { cid?: string }; IpfsHash?: string };

  // Pinata v3 API returns { data: { cid } }; v2 returns { IpfsHash }
  const cid = json.data?.cid ?? json.IpfsHash;
  if (!cid) throw new Error('Pinata response did not include a CID');

  return cid;
}

/**
 * Fetch an encrypted blob from IPFS by CID.
 * Tries the configured gateway; falls back to the public Pinata gateway.
 */
export async function fetchFromIPFS(cid: string, config: Pick<IpfsConfig, 'gatewayUrl'>): Promise<Uint8Array> {
  const base = config.gatewayUrl ?? PINATA_GATEWAY_DEFAULT;
  const url = `${base}/${cid}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`IPFS fetch failed (${response.status}) for CID ${cid}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
