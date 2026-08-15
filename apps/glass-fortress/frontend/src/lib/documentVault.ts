// Client-side document vault utilities — uses Web Crypto API only (no external deps).
// Mirror of packages/document-vault; can be replaced with the workspace import once
// the monorepo workspace link is installed via `npm install`.

const IV_LENGTH = 12;

// ─── Encryption ───────────────────────────────────────────────────────────────

export interface EncryptResult {
  /** IV (12 bytes) prepended to AES-GCM-256 ciphertext */
  ciphertext: Uint8Array;
  /** Exportable JWK of the AES key — pass to the server for ephemeral analysis only */
  aesKeyJwk: JsonWebKey;
}

export async function encryptFile(file: File): Promise<EncryptResult> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = await file.arrayBuffer();
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuffer), IV_LENGTH);

  const aesKeyJwk = await crypto.subtle.exportKey('jwk', key);
  return { ciphertext: combined, aesKeyJwk };
}

// ─── Metadata stripping ───────────────────────────────────────────────────────

export interface StripResult {
  file: File;
  warnings: string[];
}

export async function stripMetadata(file: File): Promise<StripResult> {
  const ext = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === 'image/jpeg' || ext.endsWith('.jpg') || ext.endsWith('.jpeg')) {
    return stripJpeg(file);
  }
  if (type === 'image/png' || ext.endsWith('.png')) {
    return stripPng(file);
  }
  if (type === 'application/pdf' || ext.endsWith('.pdf')) {
    return {
      file,
      warnings: ['PDF metadata stripping requires desktop software. Consider printing to PDF via your OS print dialog to minimize embedded metadata.'],
    };
  }
  // HEIC/HEIF from iPhone — pass through with warning
  if (type === 'image/heic' || type === 'image/heif' || ext.endsWith('.heic') || ext.endsWith('.heif')) {
    return {
      file,
      warnings: ['HEIC images may contain EXIF location and device data. Convert to JPEG or PNG for maximum metadata removal.'],
    };
  }
  // Unknown type — pass through
  return { file, warnings: [] };
}

function stripJpeg(file: File): Promise<StripResult> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return { file, warnings: ['File does not appear to be a valid JPEG.'] };
    }

    const STRIP_MARKERS = new Set([
      0xe1, // APP1 — EXIF / XMP
      0xed, // APP13 — IPTC / Photoshop
      0xfe, // COM — comment
    ]);

    const out: number[] = [0xff, 0xd8]; // SOI
    let i = 2;

    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1]!;

      // SOS (Start of Scan) — image data follows; copy remainder verbatim
      if (marker === 0xda) {
        for (let j = i; j < bytes.length; j++) out.push(bytes[j]!);
        break;
      }
      // EOI (End of Image) — no length field
      if (marker === 0xd9) {
        out.push(0xff, 0xd9);
        break;
      }
      // Markers with no length (RST0–RST7, SOI)
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
        out.push(0xff, marker);
        i += 2;
        continue;
      }

      const segLen = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      if (STRIP_MARKERS.has(marker)) {
        i += 2 + segLen; // skip this segment
      } else {
        for (let j = i; j < i + 2 + segLen; j++) out.push(bytes[j]!);
        i += 2 + segLen;
      }
    }

    return {
      file: new File([new Uint8Array(out)], file.name, { type: 'image/jpeg' }),
      warnings: [],
    };
  });
}

function stripPng(file: File): Promise<StripResult> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    for (let s = 0; s < 8; s++) {
      if (bytes[s] !== PNG_SIG[s]) {
        return { file, warnings: ['File does not appear to be a valid PNG.'] };
      }
    }

    const STRIP_CHUNKS = new Set([
      'tEXt', 'iTXt', 'zTXt', // text metadata
      'tIME',                   // last-modification time
      'iCCP',                   // ICC colour profile
      'pHYs',                   // pixel dimensions
      'cHRM', 'gAMA', 'sBIT',  // colour calibration
      'sPLT', 'hIST', 'bKGD',  // misc metadata
    ]);

    const out: number[] = [...PNG_SIG];
    let i = 8;

    while (i <= bytes.length - 4) {
      const dataLen = (bytes[i]! << 24 | bytes[i + 1]! << 16 | bytes[i + 2]! << 8 | bytes[i + 3]!) >>> 0;
      if (i + 4 + 4 + dataLen + 4 > bytes.length) break;

      const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
      const chunkTotal = 4 + 4 + dataLen + 4; // len + type + data + CRC

      if (!STRIP_CHUNKS.has(type)) {
        for (let j = i; j < i + chunkTotal; j++) out.push(bytes[j]!);
      }
      i += chunkTotal;
    }

    return {
      file: new File([new Uint8Array(out)], file.name, { type: 'image/png' }),
      warnings: [],
    };
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
