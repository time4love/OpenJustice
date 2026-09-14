// ---------------------------------------------------------------------------
// THE CITATION TOKENS IN A VERSION'S TEXT — docs/gf-thesis-flows.md A1 :1241–:1245, T2 :365–:381.
//
//   #ev_0x<64 hex>   a corpus record by its name — ID(record), evidence A1; nothing else may follow the prefix
//   #tr_<cuid>       a ClaimTrajectory.id — the detection pass's row, never a claimHash
//   a token the parser cannot resolve is a refusal at the version write, never a plain string
//
// THE GRAMMAR (the R47 sketch §c, accepted by REVIEW): a token begins at `#ev_`, `#tr_` or `#doc_`,
// and its BODY is the maximal run of ASCII letters and digits after the prefix — so punctuation or
// Hebrew directly after a name ends the token, and a sentence-final `#ev_0x….` parses. The body is then
// read strictly: an `#ev_` name is `0x` + 64 LOWERCASE hex, the form a record's name is displayed in
// (evidence A1 :899–:901) and never normalised here — a parser that lowercased would store a name
// nobody cited. A `#tr_` body is non-empty; whether a pass stored it is the version write's question.
//
// `#doc_` IS RECOGNISED AND NOT YET CITABLE (the researcher's ruling, R47 round 2). Thesis T2 :377 adds
// the kind and document plan step 33 builds it "by addition at thesis step 20's parser": until then the
// token is reported as what it is, so the write refuses it rather than storing it as text, and step 33
// turns this one arm into a DOCUMENT citation.
//
// PURE: it imports nothing. It reads a string and returns values; the refusal wording is the write's.
// ---------------------------------------------------------------------------

/** A citation the text makes, deduplicated per (kind, name). */
export interface Citation {
  kind: 'EVIDENCE' | 'TRAJECTORY';
  name: string;
}

export type ParsedCitations =
  | { parsed: true; citations: Citation[] }
  /** The first token in text order whose body is not a name of its kind. */
  | { parsed: false; reason: 'MALFORMED'; token: string }
  /** A `#doc_` token — recognised; the document class lands at document plan step 33. */
  | { parsed: false; reason: 'DOCUMENT_NOT_BUILT'; token: string };

const TOKEN = /#(ev|tr|doc)_([A-Za-z0-9]*)/g;
const RECORD_NAME = /^0x[0-9a-f]{64}$/;

/** Every citation in `text`, in first-occurrence order — or the first token that cannot be one. */
export function parseCitations(text: string): ParsedCitations {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(TOKEN)) {
    // `.at()` — typed `string | undefined` under both debt ratchets (CLAUDE.md); both groups always participate.
    const token = match.at(0) ?? '';
    const prefix = match.at(1);
    const body = match.at(2) ?? '';
    if (prefix === 'doc') return { parsed: false, reason: 'DOCUMENT_NOT_BUILT', token };

    const kind = prefix === 'ev' ? 'EVIDENCE' : 'TRAJECTORY';
    const readable = kind === 'EVIDENCE' ? RECORD_NAME.test(body) : body !== '';
    if (!readable) return { parsed: false, reason: 'MALFORMED', token };

    const key = `${kind} ${body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ kind, name: body });
  }

  return { parsed: true, citations };
}
