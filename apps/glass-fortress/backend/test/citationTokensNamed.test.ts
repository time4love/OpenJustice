import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_INSTRUCTIONS } from '../src/mcp/instructions';

// ---------------------------------------------------------------------------
// THE MODEL-FACING COPY NAMES EVERY CITATION TOKEN — R82 Entry 13 (MEDIUM): document flows A4 :1452–:1453; thesis T2
// :377–:380; the graded sketch (a) :56–:57.
//
// Claude in claude.ai learns what a citation IS from three kinds of text: each tool's `description`, each schema field's
// `.describe(...)`, and the connector's instructions. Before this case, create_thesis told it "a #doc_ token — documents
// are not citable yet" and three more texts listed `#ev_` and `#tr_` alone, while the version write had accepted `#doc_`
// since chunk 2 (#592). A model reading a text that contradicts the code refuses or misdescribes the act the researcher
// asked for.
//
// TWO RULES over every such text: (1) a text that LISTS the citation tokens — it names both `#ev_` and `#tr_` — names
// `#doc_` as well; (2) no text says a document cannot be cited. A text is ONE string expression — a `description:` or a
// `.describe(` argument, its literals joined by `+` — or one paragraph of the instructions, so a `#doc_` elsewhere in the
// same file cannot satisfy a list that lacks it.
// ---------------------------------------------------------------------------

const MCP = join(__dirname, '..', 'src', 'mcp');

/** A string literal's body: '…', "…" or `…`, escapes kept as written — the scan reads words, not values. */
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/y;

/**
 * The string expression starting at `from` — literals joined by `+`, whitespace and line breaks between — as one text.
 * It stops at the first token that is neither, which is where the expression ends.
 */
function stringExpressionAt(source: string, from: number): string {
  const parts: string[] = [];
  let at = from;
  for (;;) {
    while (at < source.length && /\s/.test(source.charAt(at))) at += 1;
    LITERAL.lastIndex = at;
    const literal = LITERAL.exec(source);
    if (literal === null) break;
    parts.push(literal[1] ?? literal[2] ?? literal[3] ?? '');
    at = LITERAL.lastIndex;
    while (at < source.length && /\s/.test(source.charAt(at))) at += 1;
    if (source.charAt(at) !== '+') break;
    at += 1;
  }
  return parts.join('');
}

/** Every text a model reads in `source`: each `description:` value and each `.describe(` argument. */
function modelFacingTexts(file: string, source: string): { where: string; text: string }[] {
  const texts: { where: string; text: string }[] = [];
  for (const marker of [/description:\s*/g, /\.describe\(\s*/g]) {
    for (const match of source.matchAll(marker)) {
      const text = stringExpressionAt(source, match.index + match[0].length);
      if (text !== '') texts.push({ where: `${file} :${String(source.slice(0, match.index).split('\n').length)}`, text });
    }
  }
  return texts;
}

/** A text's sentences — the unit both rules judge, so one clause's words cannot answer for another's. */
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+/);

/**
 * RULE 1's ALLOW-LIST — a sentence naming `#ev_` beside the word citation that is TRUE without `#doc_`, each with why. A
 * row that no longer stands in the copy fails the floor below, so the list cannot outlive its sentence.
 */
const RULE_1_TRUE = new Map<string, string>([
  [
    'WHAT A CITATION POINTS AT — the record behind an #ev_ name, and who cites it.',
    'resolve_record resolves an #ev_ name; a commitment resolving to §7’s public block is step 34’s (document A4 :1466–:1467)',
  ],
]);

/**
 * RULE 1 — a sentence that names `#ev_` AS A CITATION TOKEN names `#doc_` too. A sentence names `#ev_` as a token when it
 * also names `#tr_`, or the word token or citation (R82 Entry 14: "a citation per #ev_ token" named #ev_ alone and was
 * BLIND to a rule that asked for #ev_ AND #tr_). Per SENTENCE, because one description carries its token list AND its
 * refusals, and a `#doc_` in the refusals would otherwise answer for a list that lacks it (C13b, C13c).
 */
const namesEvAsAToken = (sentence: string): boolean =>
  sentence.includes('#ev_') && (sentence.includes('#tr_') || /\btokens?\b|\bcitations?\b/i.test(sentence));
const listsTokensWithoutDoc = (text: string): boolean =>
  sentencesOf(text).some((sentence) => namesEvAsAToken(sentence) && !sentence.includes('#doc_') && !RULE_1_TRUE.has(sentence));

/** RULE 2's ALLOW-LIST — the real refusal glosses, each with why it is not a claim that a document cannot be cited. */
const RULE_2_TRUE = new Map<string, string>([
  [
    "THE CITATION COMES FIRST: the thesis's head version must already mention the record (#ev_<fileHash>, or #doc_<commitment> for a document), or this refuses NOT_CITED — there is no promotion of a record no text cites.",
    'NOT_CITED’s gloss (open_debate): "no text cites" is the refusal’s condition, and the sentence names #doc_ as citable',
  ],
]);

/**
 * RULE 2 — no sentence says a document cannot be cited. A sentence names a document (`document`, `#doc_`) AND carries a
 * NEGATION BEFORE a form of cite in the same clause — not · cannot · can't · may not · must not · never · no, with no
 * `.`, `;`, `,`, `—` or `:` between — or states that citing is not possible (R82 Entry 14: "Documents can't be cited
 * yet." and "No document may be cited in a thesis." were BLIND to the first regex, which knew one wording).
 */
const NEGATED_CITE =
  /\b(?:not|cannot|can['’]t|may not|must not|never|no)\b[^.;,—:]{0,40}\bcit(?:e|ed|es|able|ing)\b|\bcit(?:e|ed|ing)\w*[^.;,—:]{0,30}\b(?:is|are) not (?:possible|allowed|supported)\b/i;
const namesADocument = (sentence: string): boolean => /\bdocuments?\b|#doc_/i.test(sentence);
const saysNotCitable = (text: string): boolean =>
  sentencesOf(text).some((sentence) => namesADocument(sentence) && NEGATED_CITE.test(sentence) && !RULE_2_TRUE.has(sentence));

/** Every model-facing text of the MCP surface: the server's and each tool file's, and the instructions' paragraphs. */
function surfaceTexts(): { where: string; text: string }[] {
  const files = ['mcpServer.ts', ...readdirSync(join(MCP, 'tools')).filter((name) => name.endsWith('.ts')).map((name) => `tools/${name}`)];
  return [
    ...files.flatMap((file) => modelFacingTexts(file, readFileSync(join(MCP, file), 'utf8'))),
    ...MCP_INSTRUCTIONS.split('\n\n').map((paragraph, index) => ({ where: `instructions ¶${String(index + 1)}`, text: paragraph })),
  ];
}

describe('the model-facing copy names every citation token, and never says a document is not citable (R82 Entry 13)', () => {
  const texts = surfaceTexts();

  it('reads the surface at all — descriptions, describes and paragraphs, and the four texts that list the tokens', () => {
    // THE FLOOR: a reader that found nothing would pass both rules vacuously.
    expect(texts.length).toBeGreaterThan(150);
    const listing = texts.filter((one) => one.text.includes('#ev_') && one.text.includes('#tr_')).map((one) => one.where.split(' :').at(0));
    for (const subject of ['mcpServer.ts', 'tools/createThesis.ts', 'tools/addThesisVersion.ts', 'instructions ¶']) {
      expect(listing.some((where) => where?.startsWith(subject) === true)).toBe(true);
    }
  });

  it('the ALLOW-LISTS still stand in the copy — each row is a sentence the surface carries, word for word', () => {
    const sentences = new Set(texts.flatMap((one) => sentencesOf(one.text)));
    expect([...RULE_1_TRUE.keys(), ...RULE_2_TRUE.keys()].filter((sentence) => !sentences.has(sentence))).toEqual([]);
  });

  it('RULE 1 — every sentence naming #ev_ as a citation token names #doc_ as well (document A4 :1453; thesis T2 :377–:380)', () => {
    expect(texts.filter((one) => listsTokensWithoutDoc(one.text)).map((one) => one.where)).toEqual([]);
  });

  it('RULE 2 — no text says a document cannot be cited', () => {
    expect(texts.filter((one) => saysNotCitable(one.text)).map((one) => one.where)).toEqual([]);
  });

  it('DECOYS — the old sentences, planted in the shapes they were written in, are each caught', () => {
    // create_thesis's description as it stood before this round (mcpServer.ts, a `+`-joined description).
    const oldDescription = [
      "  description:\n        'the text is stored verbatim; each citation is a token inside it: #ev_ followed by ' +",
      "        'a record\\'s name exactly as list_findings returns it, or #tr_ followed by a trajectory id. Refuses NOT_A_RECORD (a ' +",
      "        'name the corpus does not hold, or a #doc_ token — documents are not citable yet).',\n",
    ].join('\n');
    const planted = modelFacingTexts('decoy.ts', oldDescription);
    expect(planted.filter((one) => saysNotCitable(one.text))).toHaveLength(1);
    // A describe listing the two tokens alone, in a double-quoted continuation — the schema's own shape.
    const oldDescribe = ".describe(\n      'each citation an inline token: #ev_ and a ' +\n        \"record's name from list_findings, or #tr_ and a trajectory id\",\n    )";
    expect(modelFacingTexts('decoy.ts', oldDescribe).filter((one) => listsTokensWithoutDoc(one.text))).toHaveLength(1);
    // The instructions' old NOT_YET sentence, as a paragraph.
    expect(saysNotCitable('A document cannot be cited yet: a #doc_ token is refused.')).toBe(true);
    // THE BLIND SHAPE: the list lacks #doc_ while the SAME description names #doc_ in its refusals — still caught.
    const listThenRefusals =
      'The version is ONE transaction: a citation per #ev_ or #tr_ token, each pin computed. Refuses NOT_A_RECORD (a name the ' +
      'corpus does not hold, or a #doc_ commitment no document holds) and SHED.';
    expect(listsTokensWithoutDoc(listThenRefusals)).toBe(true);
    // R82 ENTRY 14's THREE BLIND SPELLINGS, each now caught.
    expect(listsTokensWithoutDoc('The version is ONE transaction: the text verbatim, its hash, a citation per #ev_ token, each pin computed.')).toBe(true);
    expect(saysNotCitable("Documents can't be cited yet.")).toBe(true);
    expect(saysNotCitable('No document may be cited in a thesis.')).toBe(true);
    // And the other negation forms the rule names.
    for (const sentence of [
      'A document may not be cited.',
      'A #doc_ token must not be cited in a draft.',
      'Never cite a document.',
      'Citing a document is not possible yet.',
    ]) {
      expect([sentence, saysNotCitable(sentence)]).toEqual([sentence, true]);
    }
    // And the fixed wording passes both rules — the rules do not fire on a text that is right.
    const fixed = "each citation an inline token: #ev_ and a record's name, #tr_ and a trajectory id, or #doc_ and a document's commitment";
    expect([listsTokensWithoutDoc(fixed), saysNotCitable(fixed)]).toEqual([false, false]);
  });
});
