// ---------------------------------------------------------------------------
// THE CITATION TOKENS IN A VERSION'S TEXT — docs/gf-thesis-flows.md A1 :1241–:1245, T2 :365–:381.
//
//   #ev_0x<64 hex>    a corpus record by its name — ID(record), evidence A1; nothing else may follow the prefix
//   #tr_<cuid>        a ClaimTrajectory.id — the detection pass's row, never a claimHash
//   #doc_0x<64 hex>   a DOCUMENT by its COMMITMENT — document flows A1 :1241, displayed as :1244 displays every hash
//   a token the parser cannot resolve is a refusal at the version write, never a plain string
//
// THE GRAMMAR (the R47 sketch §c, accepted by REVIEW): a token begins at `#ev_`, `#tr_` or `#doc_`,
// and its BODY is the maximal run of ASCII letters and digits after the prefix — so punctuation or
// Hebrew directly after a name ends the token, and a sentence-final `#ev_0x….` parses. The body is then
// read strictly: an `#ev_` name and a `#doc_` commitment are each `0x` + 64 LOWERCASE hex, the form every
// hash is displayed in (evidence A1 :899–:901, document A1 :1244) and never normalised here — a parser that
// lowercased would store a name nobody cited. A `#tr_` body is non-empty; whether a pass stored it is the
// version write's question.
//
// `#doc_` IS A CITATION OF KIND DOCUMENT — document plan step 33 :243, "by addition at thesis step 20's
// parser". Until that step the arm was recognised and refused (the researcher's ruling, R47 round 2); the
// kind is the whole difference the token exists to show (document flows §6 :655–:660), so it is never
// folded into `#ev_`. Whether a document of that commitment exists is the version write's question.
//
// PURE: it imports nothing. It reads a string and returns values; the refusal wording is the write's.
// ---------------------------------------------------------------------------

/** A citation the text makes, deduplicated per (kind, name). */
export interface Citation {
  kind: 'EVIDENCE' | 'TRAJECTORY' | 'DOCUMENT';
  name: string;
}

export type ParsedCitations =
  | { parsed: true; citations: Citation[] }
  /** The first token in text order whose body is not a name of its kind. */
  | { parsed: false; reason: 'MALFORMED'; token: string };

const TOKEN = /#(ev|tr|doc)_([A-Za-z0-9]*)/g;
/** A record's name and a document's commitment alike: `0x` + 64 lowercase hex. */
const HASH_NAME = /^0x[0-9a-f]{64}$/;

const KIND = { ev: 'EVIDENCE', tr: 'TRAJECTORY', doc: 'DOCUMENT' } as const;

/** Every citation in `text`, in first-occurrence order — or the first token that cannot be one. */
export function parseCitations(text: string): ParsedCitations {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(TOKEN)) {
    // `.at()` — typed `string | undefined` under both debt ratchets (CLAUDE.md); both groups always participate.
    const token = match.at(0) ?? '';
    const prefix = match.at(1);
    const body = match.at(2) ?? '';
    // The regex admits exactly the three prefixes, so an unknown one is a defective pattern, not a text.
    if (prefix !== 'ev' && prefix !== 'tr' && prefix !== 'doc') {
      throw new Error(`citationTokens: the token pattern matched the prefix ${String(prefix)}, which it cannot.`);
    }
    const kind = KIND[prefix];
    const readable = kind === 'TRAJECTORY' ? body !== '' : HASH_NAME.test(body);
    if (!readable) return { parsed: false, reason: 'MALFORMED', token };

    const key = `${kind} ${body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ kind, name: body });
  }

  return { parsed: true, citations };
}
