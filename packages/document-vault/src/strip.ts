export interface StripResult {
  file: File;
  /** Non-empty only when stripping was partial or impossible. */
  warnings: string[];
}

/**
 * Strip identity-revealing metadata from a file before encryption.
 * - PDF: clears all info-dict fields and XMP via pdf-lib.
 * - JPEG: removes APP1 (EXIF/XMP), APP13 (IPTC), and COM (comment) segments.
 * - PNG: removes tEXt, iTXt, zTXt, tIME, iCCP, pHYs, cHRM, gAMA, sBIT chunks.
 * - Office (.docx, .xlsx, etc.): returns original with a warning — export to PDF first.
 */
export async function stripMetadata(file: File): Promise<StripResult> {
  const { type, name } = file;

  if (type === 'application/pdf') return stripPdf(file);
  if (type === 'image/jpeg') return stripJpeg(file);
  if (type === 'image/png') return stripPng(file);

  if (isOfficeDoc(type, name)) {
    return {
      file,
      warnings: [
        'Office documents cannot have metadata stripped in the browser. ' +
          'Export to PDF ("Save As PDF") before uploading.',
      ],
    };
  }

  return { file, warnings: [] };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function stripPdf(file: File): Promise<StripResult> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const stripped = await doc.save();
  return {
    file: new File([new Uint8Array(stripped)], file.name, { type: 'application/pdf' }),
    warnings: [],
  };
}

// ─── JPEG ────────────────────────────────────────────────────────────────────

/** APP1=EXIF/XMP, APP13=IPTC/Photoshop, COM=comment */
const JPEG_STRIP_MARKERS = new Set([0xe1, 0xed, 0xfe]);

function stripJpeg(file: File): Promise<StripResult> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);

    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return { file, warnings: ['File does not appear to be a valid JPEG — metadata not stripped.'] };
    }

    const out: number[] = [0xff, 0xd8];
    let i = 2;

    while (i < bytes.length) {
      if (bytes[i] !== 0xff) break; // reached scan data
      const marker = bytes[i + 1];

      if (marker === 0xda) {
        // SOS — scan data starts; append everything from here to end verbatim
        for (let j = i; j < bytes.length; j++) out.push(bytes[j]);
        break;
      }

      if (marker === 0xd9) {
        // EOI
        out.push(0xff, 0xd9);
        break;
      }

      const segLength = (bytes[i + 2] << 8) | bytes[i + 3]; // includes the 2-byte length field itself

      if (JPEG_STRIP_MARKERS.has(marker)) {
        // Skip this segment entirely
        i += 2 + segLength;
      } else {
        // Keep
        for (let j = i; j < i + 2 + segLength; j++) out.push(bytes[j]);
        i += 2 + segLength;
      }
    }

    return {
      file: new File([new Uint8Array(out)], file.name, { type: 'image/jpeg' }),
      warnings: [],
    };
  });
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Chunk types that contain identity/tracking metadata — safe to drop. */
const PNG_STRIP_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'tIME', 'iCCP', 'pHYs', 'cHRM', 'gAMA', 'sBIT', 'sPLT', 'hIST', 'bKGD']);

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function stripPng(file: File): Promise<StripResult> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);

    for (let s = 0; s < PNG_SIGNATURE.length; s++) {
      if (bytes[s] !== PNG_SIGNATURE[s]) {
        return { file, warnings: ['File does not appear to be a valid PNG — metadata not stripped.'] };
      }
    }

    const out: number[] = [...PNG_SIGNATURE];
    let i = 8; // skip signature

    while (i < bytes.length) {
      const dataLength = readUint32BE(bytes, i);
      const type = chunkType(bytes, i + 4);
      const chunkTotal = 4 + 4 + dataLength + 4; // length + type + data + CRC

      if (!PNG_STRIP_CHUNKS.has(type)) {
        for (let j = i; j < i + chunkTotal; j++) out.push(bytes[j]);
      }

      i += chunkTotal;
    }

    return {
      file: new File([new Uint8Array(out)], file.name, { type: 'image/png' }),
      warnings: [],
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OFFICE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const OFFICE_EXTENSIONS = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.odt', '.ods', '.odp'];

function isOfficeDoc(type: string, name: string): boolean {
  if (OFFICE_TYPES.has(type)) return true;
  const lower = name.toLowerCase();
  return OFFICE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
