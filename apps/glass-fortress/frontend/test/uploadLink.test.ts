import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDocumentCommand, DOCUMENT_FAMILIES, paramsOf, readUploadLink } from '../src/lib/uploadLink';
import { messagesFor } from './render';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S LINK — what it carries and what the dialog makes of it. Document flows §9 :998 (the link
// carries the context; the dialog draws it as LABELS; to change a fact the researcher returns to the conversation
// for a new link) · A4 :1428 (the link's facts are DEFAULTS) · the approved DOCUMENTS paragraph, step (3) (Claude
// SETs title= and at=, replacing any value the link carries) · R78 chunk-3 prompt amendment 2 (a REPEATED key is
// a MALFORMED LINK, refused loudly; the dialog never picks the first or the last).
// ---------------------------------------------------------------------------

const link = (query: string) => readUploadLink(new URLSearchParams(query));

describe('a well-formed link — every fact it brought, one value each', () => {
  it('title, page, date and derived-from, as the composer spells them', () => {
    expect(
      link('url=https%3A%2F%2Fdoi.org%2F10.1%2Fx&at=2026-09-03&derivedFrom=0xabc&derivedFromTitle=the+interview&derivedFromFamily=VIDEO&title=the+dataset'),
    ).toEqual({
      state: 'READY',
      title: 'the dataset',
      url: 'https://doi.org/10.1/x',
      at: '2026-09-03',
      derivedFrom: { commitment: '0xabc', title: 'the interview', family: 'VIDEO' },
    });
  });

  it('a fact the link did not bring is ABSENT, never an empty value — a label not brought is not drawn', () => {
    expect(link('title=the+dataset')).toEqual({ state: 'READY', title: 'the dataset', url: null, at: null, derivedFrom: null });
  });
});

describe('a link the dialog REFUSES, loudly, with its reason', () => {
  it.each(['at', 'title', 'url', 'derivedFrom', 'derivedFromTitle', 'derivedFromFamily'])('a REPEATED %s is a malformed link — never the first, never the last', (key) => {
    const query = new URLSearchParams('title=a&url=u&at=2026-09-03&derivedFrom=0xabc&derivedFromTitle=t&derivedFromFamily=VIDEO');
    query.append(key, key === 'at' ? '2026-09-04' : key === 'derivedFromFamily' ? 'AUDIO' : 'second');
    expect(readUploadLink(query)).toEqual({ state: 'MALFORMED', key });
  });

  it('a family the door does not name is malformed — the dialog would have no word for it (board י1ב)', () => {
    expect(link('title=a&derivedFrom=0xabc&derivedFromFamily=TEXT')).toEqual({ state: 'MALFORMED', key: 'derivedFromFamily' });
    expect(link('title=a&derivedFrom=0xabc&derivedFromFamily=video')).toEqual({ state: 'MALFORMED', key: 'derivedFromFamily' });
  });

  it('a date that is not YYYY-MM-DD is malformed — add_document would refuse the command it printed', () => {
    expect(link('title=a&at=3.9.2026')).toEqual({ state: 'MALFORMED', key: 'at' });
  });

  it('NO title — the dialog accepts no file; the title is agreed in the conversation (A2 :1271)', () => {
    expect(link('url=u')).toEqual({ state: 'NO_TITLE' });
    expect(link('title=%20%20')).toEqual({ state: 'NO_TITLE' });
  });
});

describe('the command the dialog prints — the board’s order (י1, י1ב)', () => {
  it('docId · mimeType · title · derivedFrom · assertedUrl · assertedAt, each only when the link brought it', () => {
    const command = addDocumentCommand(
      { docId: '0x' + 'ab'.repeat(32), mimeType: 'application/pdf' },
      { state: 'READY', title: 'תמליל הריאיון', url: 'https://x.test/p', at: '2026-09-12', derivedFrom: { commitment: '0xc1', title: null, family: null } },
    );
    expect(command.text).toBe(
      `add_document docId=0x${'ab'.repeat(32)} mimeType=application/pdf title="תמליל הריאיון" derivedFrom=0xc1 assertedUrl=https://x.test/p assertedAt=2026-09-12`,
    );
    // The title is ISOLATED for display (ui §4, `<bdi>`): the command is split around it so the view can wrap it.
    expect(command.before + '"' + command.title + '"' + command.after).toBe(command.text);
  });

  it('with no page, date or derived-from, the command carries only what the tool requires', () => {
    const command = addDocumentCommand({ docId: '0x' + 'cd'.repeat(32), mimeType: 'text/csv' }, { state: 'READY', title: 't', url: null, at: null, derivedFrom: null });
    expect(command.text).toBe(`add_document docId=0x${'cd'.repeat(32)} mimeType=text/csv title="t"`);
  });

  it('a double quote inside the title is escaped, so the command still parses as one title', () => {
    const command = addDocumentCommand({ docId: '0x' + 'ef'.repeat(32), mimeType: 'text/csv' }, { state: 'READY', title: 'the "big" one', url: null, at: null, derivedFrom: null });
    expect(command.text).toContain('title="the \\"big\\" one"');
  });
});

describe('the page hands the dialog the link AS IT CAME — a repeated key survives the conversion', () => {
  it('Next’s searchParams record (an array for a repeated key) becomes the same parameters, repeats kept', () => {
    const params = paramsOf({ title: 't', at: ['2026-09-03', '2026-09-04'], url: undefined });
    expect(params.getAll('at')).toEqual(['2026-09-03', '2026-09-04']);
    expect(params.has('url')).toBe(false);
    expect(readUploadLink(params)).toEqual({ state: 'MALFORMED', key: 'at' });
  });
});

describe('the family has ONE spelling across the wire, and ONE word per family', () => {
  it('the dialog’s families ARE the backend’s `DocumentFamily` — read from its source, never copied', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'backend', 'src', 'lib', 'acceptedDocumentTypes.ts'), 'utf8');
    const union = /export type DocumentFamily = ([^;]+);/.exec(source)?.[1];
    if (union === undefined) throw new Error('no DocumentFamily union in backend/src/lib/acceptedDocumentTypes.ts');
    const backend = [...union.matchAll(/'([A-Z]+)'/g)].map((m) => m[1]);
    expect([...DOCUMENT_FAMILIES]).toEqual(backend);
  });

  it.each(['he', 'en'] as const)('every family’s word (%s) is the STRIP’s own word — no new copy', (locale) => {
    const upload = (messagesFor(locale) as { upload: { strip: string; family: Record<string, string> } }).upload;
    // THE FLOOR: one word per family, each found in the approved strip.
    expect(Object.keys(upload.family).sort()).toEqual([...DOCUMENT_FAMILIES].sort());
    for (const word of Object.values(upload.family)) expect(upload.strip.split(' · ')).toContain(word);
  });
});
