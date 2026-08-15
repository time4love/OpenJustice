import { PDFDocument } from 'pdf-lib';
import { stripMetadata } from '../src/strip';

// ─── Minimal fixture builders ─────────────────────────────────────────────────

/**
 * Minimal 1x1 white JPEG with one APP1 (EXIF) segment and one COM segment.
 * Structure: SOI, APP0, APP1 (fake EXIF), COM, EOI — no actual image data needed
 * for metadata-strip tests.
 */
function makeJpegWithExif(): Uint8Array {
  const bytes: number[] = [];

  // SOI
  bytes.push(0xff, 0xd8);

  // APP0 (JFIF) — length 16 (14 bytes of JFIF data + 2 byte length field)
  bytes.push(0xff, 0xe0); // APP0 marker
  bytes.push(0x00, 0x10); // length = 16
  bytes.push(0x4a, 0x46, 0x49, 0x46, 0x00); // "JFIF\0"
  bytes.push(0x01, 0x01); // version
  bytes.push(0x00); // aspect ratio units
  bytes.push(0x00, 0x01, 0x00, 0x01); // density
  bytes.push(0x00, 0x00); // thumbnail

  // APP1 (EXIF) — fake EXIF payload
  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xde, 0xad]; // "Exif\0\0" + data
  bytes.push(0xff, 0xe1); // APP1 marker
  bytes.push(0x00, exifPayload.length + 2); // length includes itself
  bytes.push(...exifPayload);

  // COM (comment)
  const comment = [0x41, 0x75, 0x74, 0x68, 0x6f, 0x72]; // "Author"
  bytes.push(0xff, 0xfe); // COM marker
  bytes.push(0x00, comment.length + 2);
  bytes.push(...comment);

  // APP13 (IPTC) — fake
  const iptc = [0x50, 0x68, 0x6f, 0x74, 0x6f, 0x73, 0x68, 0x6f, 0x70]; // "Photoshop"
  bytes.push(0xff, 0xed);
  bytes.push(0x00, iptc.length + 2);
  bytes.push(...iptc);

  // EOI (no SOS — this isn't a real renderable JPEG, just a metadata test fixture)
  bytes.push(0xff, 0xd9);

  return new Uint8Array(bytes);
}

/**
 * Minimal PNG with:
 *  - IHDR chunk
 *  - tEXt chunk (metadata — should be stripped)
 *  - iTXt chunk (international text metadata — should be stripped)
 *  - IDAT chunk (minimal, just a placeholder)
 *  - IEND chunk
 */
function makePngWithMetadata(): Uint8Array {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function crc32(data: number[]): number {
    // Simple CRC32 for test fixtures — not production use
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type: string, data: number[]): number[] {
    const typeBytes = type.split('').map((c) => c.charCodeAt(0));
    const len = data.length;
    const crcInput = [...typeBytes, ...data];
    const crcVal = crc32(crcInput);
    return [
      (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
      ...typeBytes,
      ...data,
      (crcVal >>> 24) & 0xff, (crcVal >>> 16) & 0xff, (crcVal >>> 8) & 0xff, crcVal & 0xff,
    ];
  }

  // IHDR: 1x1, 8-bit RGB
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);

  // tEXt: "Author\0Jane Doe"
  const textData = [...'Author\0Jane Doe'].map((c) => c.charCodeAt(0));
  const text = chunk('tEXt', textData);

  // iTXt: "Comment\0\0\0\0\0Location data"
  const itxtData = [...'Comment\0\0\0\0\0Location data'].map((c) => c.charCodeAt(0));
  const itxt = chunk('iTXt', itxtData);

  // IDAT: minimal valid compressed scanline placeholder
  const idat = chunk('IDAT', [0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]);

  // IEND
  const iend = chunk('IEND', []);

  return new Uint8Array([...PNG_SIG, ...ihdr, ...text, ...itxt, ...idat, ...iend]);
}

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  // new Uint8Array(arrayLike) returns Uint8Array<ArrayBuffer> (TS 5.9 overload resolution)
  return new File([new Uint8Array(bytes)], name, { type });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('stripMetadata — PDF', () => {
  async function makePdfWithMetadata(): Promise<Uint8Array<ArrayBuffer>> {
    const doc = await PDFDocument.create();
    doc.setTitle('Top Secret Report');
    doc.setAuthor('Jane Whistleblower');
    doc.setSubject('Classified information');
    doc.setKeywords(['secret', 'classified']);
    doc.setProducer('Internal Tool v1.0');
    doc.setCreator('Jane Whistleblower');
    doc.addPage();
    return new Uint8Array(await doc.save());
  }

  it('clears author, title, subject, keywords, producer, creator', async () => {
    const pdfBytes = await makePdfWithMetadata();
    const file = makeFile(pdfBytes, 'report.pdf', 'application/pdf');
    const { file: stripped, warnings } = await stripMetadata(file);

    expect(warnings).toHaveLength(0);

    const outBytes = new Uint8Array(await stripped.arrayBuffer());
    const doc = await PDFDocument.load(outBytes);

    expect(doc.getTitle()).toBe('');
    expect(doc.getAuthor()).toBe('');
    expect(doc.getSubject()).toBe('');
    expect(doc.getKeywords()).toBe('');
    expect(doc.getCreator()).toBe('');
    // Producer is re-stamped by pdf-lib on save — it won't contain the original value
    expect(doc.getProducer()).not.toContain('Internal Tool');
  });

  it('preserves the page count', async () => {
    const pdfBytes = await makePdfWithMetadata();
    const file = makeFile(pdfBytes, 'report.pdf', 'application/pdf');
    const { file: stripped } = await stripMetadata(file);

    const outBytes = new Uint8Array(await stripped.arrayBuffer());
    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('stripMetadata — JPEG', () => {
  it('removes APP1 (EXIF), APP13 (IPTC), and COM segments', async () => {
    const file = makeFile(makeJpegWithExif(), 'photo.jpg', 'image/jpeg');
    const { file: stripped, warnings } = await stripMetadata(file);

    expect(warnings).toHaveLength(0);
    const outBytes = new Uint8Array(await stripped.arrayBuffer());

    // Should still be a JPEG (SOI + EOI)
    expect(outBytes[0]).toBe(0xff);
    expect(outBytes[1]).toBe(0xd8);

    // Must NOT contain APP1 marker (0xFF 0xE1)
    const hasApp1 = containsMarker(outBytes, 0xe1);
    expect(hasApp1).toBe(false);

    // Must NOT contain APP13 marker (0xFF 0xED)
    const hasApp13 = containsMarker(outBytes, 0xed);
    expect(hasApp13).toBe(false);

    // Must NOT contain COM marker (0xFF 0xFE)
    const hasCom = containsMarker(outBytes, 0xfe);
    expect(hasCom).toBe(false);
  });

  it('preserves APP0 (JFIF) segment', async () => {
    const file = makeFile(makeJpegWithExif(), 'photo.jpg', 'image/jpeg');
    const { file: stripped } = await stripMetadata(file);
    const outBytes = new Uint8Array(await stripped.arrayBuffer());
    expect(containsMarker(outBytes, 0xe0)).toBe(true);
  });

  it('returns a warning for invalid JPEG', async () => {
    const file = makeFile(new Uint8Array([0x00, 0x00, 0x00]), 'bad.jpg', 'image/jpeg');
    const { warnings } = await stripMetadata(file);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('stripMetadata — PNG', () => {
  it('removes tEXt and iTXt chunks', async () => {
    const file = makeFile(makePngWithMetadata(), 'image.png', 'image/png');
    const { file: stripped, warnings } = await stripMetadata(file);

    expect(warnings).toHaveLength(0);
    const outBytes = new Uint8Array(await stripped.arrayBuffer());

    expect(containsChunk(outBytes, 'tEXt')).toBe(false);
    expect(containsChunk(outBytes, 'iTXt')).toBe(false);
  });

  it('preserves IHDR, IDAT, IEND chunks', async () => {
    const file = makeFile(makePngWithMetadata(), 'image.png', 'image/png');
    const { file: stripped } = await stripMetadata(file);
    const outBytes = new Uint8Array(await stripped.arrayBuffer());

    expect(containsChunk(outBytes, 'IHDR')).toBe(true);
    expect(containsChunk(outBytes, 'IDAT')).toBe(true);
    expect(containsChunk(outBytes, 'IEND')).toBe(true);
  });

  it('returns a warning for invalid PNG', async () => {
    const file = makeFile(new Uint8Array([0x00, 0x00, 0x00]), 'bad.png', 'image/png');
    const { warnings } = await stripMetadata(file);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('stripMetadata — Office documents', () => {
  it('returns a warning for .docx files', async () => {
    const file = makeFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'contract.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const { file: out, warnings } = await stripMetadata(file);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/export to pdf/i);
    // Returns the original file unchanged
    expect(out).toBe(file);
  });

  it('detects office docs by extension when MIME type is generic', async () => {
    const file = makeFile(new Uint8Array([0x50, 0x4b]), 'report.xlsx', 'application/octet-stream');
    const { warnings } = await stripMetadata(file);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('stripMetadata — unsupported types', () => {
  it('passes through unknown types without warning', async () => {
    const file = makeFile(new Uint8Array([0x47, 0x49, 0x46]), 'anim.gif', 'image/gif');
    const { file: out, warnings } = await stripMetadata(file);
    expect(warnings).toHaveLength(0);
    expect(out).toBe(file);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function containsMarker(bytes: Uint8Array, marker: number): boolean {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === marker) return true;
  }
  return false;
}

function containsChunk(bytes: Uint8Array, type: string): boolean {
  const typeBytes = type.split('').map((c) => c.charCodeAt(0));
  outer: for (let i = 8; i <= bytes.length - 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (bytes[i + j] !== typeBytes[j]) continue outer;
    }
    return true;
  }
  return false;
}
