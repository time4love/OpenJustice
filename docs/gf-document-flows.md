# Document flows — the public · researcher · MCP · backend

**How a DOCUMENT arrives, is held, and becomes a record a thesis can cite, end to end.** The
corpus's flows are `docs/gf-interaction-flows.md`, evidence's are `docs/gf-evidence-flows.md`
and the thesis's are `docs/gf-thesis-flows.md`; this document begins at the door the thesis
flows left open — two appeals published with a thesis, and what comes back through them — and
adds nothing beneath any of the three. The reasoning is `docs/gf-architecture-target.md` §11
once these flows are signed off.

> **STATUS.** The TARGET flows, decided section by section with the researcher on 2026-09-03 and
> 2026-09-04, on the evidence and thesis designs of 2026-09-03. What fell to the researcher's
> questions in this session, each a mechanism removed or a judgement taken off a person:
> subclasses by provenance — one class, two doors (§1); the archive as a source of credibility —
> custody and credibility kept apart (§1); the ciphertext as a name — the plaintext, verified in
> memory once (§2); a sender's declaration of what their material is, proposed and withdrawn twice
> until custody followed the door (§2); extraction in the sender's browser (§3); anchoring a held
> document by its name at receipt, withdrawn when a misdeclared document showed it irreversible
> (§4); the researcher's judgement whether an authority varies its copies, removed by making the
> commitment the public name (§4, §7); a "you may decrypt" override a sender could grant (§5); the
> contact (§5); the model's verdict shown to a sender at the door (§5); redaction as an opening
> mode (§7); a researcher standing between a sender and their withdrawal (§8); a capture without an
> archive timestamp (§9). Three of this document's own recommendations were withdrawn under
> challenge and each says so where it stood. Bronze Fortress is out of scope throughout. ⚠️ marks
> what does not exist yet. Nothing is left OPEN: what is out of scope and what is verified by
> measurement are named in §12, and the APPENDIX is the implementation contract, composed with the
> factual layer's A1–A8, evidence's A1–A7 and the thesis's A1–A7 and restating none. Four clauses
> of the sibling documents are AMENDED here and named where they are: thesis T1's verdict rule
> gains UNCHECKED (§3, A6); evidence A2's `Evidence` gains kind DOCUMENT (§6, A2); evidence A3's
> FLAGGED gains SHED (§8, A3); thesis T5's `CITES_EVIDENCE` counts a document (A6).
>
> **SCOPE.** The DOCUMENT class end to end: what it is; identity, content and standing; intake
> to record; promotion and citation; what publication opens; source protection, consent and
> withdrawal; the two arrivals that come through acquisition rather than a thesis; legacy.
> OUT: the intake UI's rendering, the frontend, the thesis flows' mechanics beyond the one
> citation kind and the arrival they reserved, Bronze Fortress.

---

## 1. WHAT A DOCUMENT IS

**Five things arrive that the archive does not hold**, and the evidence design could name none
of them: a whistleblower's submission answering a call; a ministry's answer to a FOIA request
the platform published, sent in by the citizen who received it; a ministry's answer to a
request nobody made through the platform, circulating as a PDF or a photograph of the original;
a live page that blocks fetching, captured by a researcher another way; a page the archive never
crawled, held the same way. Each is bytes someone handed the platform, with a story about where
they came from.

**ONE CLASS, NOT FIVE. Ruled 2026-09-03.** The differences between them are differences in what
the party handing over the bytes ASSERTS — that a person inside saw this, that a public
authority sent it, that this URL served it on this date — and the platform verifies none of
those assertions. The bytes may carry the marks that make the assertion believable — the
ministry's letterhead, the statutory form, an official's signature — and those marks are what
make a FOIA answer high-quality, exactly as `.gov.il` in a URL, and not the archive, is what
makes a capture of it high-quality. But reading those marks is a human's act, made and assessed
in the argument for the citation (§6), and it is never a kind. A subclass named after an
unverified claim would be that claim written into the schema: a `FOIA_ANSWER` row would say the
ministry sent this when nobody had read the signature. Two things must therefore be kept apart
everywhere in this document:

```
CUSTODY       who held these bytes, since when — ATTESTED by an instrument: the archive and
              the registry for a capture; for a document, the platform's own record of receipt,
              and whatever §4 adds to it
CREDIBILITY   whether the source is worth believing — a READING of the bytes themselves: the
              domain the archive served, for a capture; the letterhead, the form and the
              signature, for a FOIA answer; the researcher's, argued, never a class
```

A document can have full credibility and weak custody — a signed ministry letter that reached
the platform as a photograph from an anonymous hand — and a capture can have full custody and
none — an archived page of an untrustworthy site. Neither axis stands in for the other.

**What the platform CAN verify is the ARRIVAL** — which door the bytes came through, who was
attributed at it, and what they were addressed to. That is two doors, not five:

```
INTAKE        the public's channel, under the submission terms: anonymous; sealed, always (§2);
              addressed to a THESIS — always — and to a GAP when it answers one of the two appeals, both
              of which carry the gap id (thesis T4). A submission, an answer to a published
              request and a circulating answer all arrive here; what the submitter says it is,
              and which decision the gap carried (CALLED or REQUESTED), are recorded as what
              they are — the submitter's word and the gap's state — never as the document's kind
RESEARCHER    a researcher's hand, through MCP, attributed: any document they hold — a FOIA
              answer they obtained, a circulating public record, a capture of a blocked or
              unarchived page — with what they assert about it, a URL and a date for a page.
              Held in plaintext (§2); the two page arrivals the factual layer parked are §9's
```

**One relation the arrival does verify: whether a request is on record.** An answer addressed
to a REQUESTED gap arrives beside the request the platform published — what was asked, of whom,
on what legal basis — and can be read against it. A circulating answer answers no request the
platform holds, and stands as a blocked page does: bytes, and the holder's account of them. The
document is the same class in both cases; the request beside it is the gap's, not the
document's, and a reader is shown which.

Every downstream difference the five seemed to need is one of two things. Either it is a
researcher's decision made on reading the document — what publication opens for it (§7) is
decided per document, because whether these bytes name a source or carry a classification is a
fact about the bytes a human reads, not about a label. Or it is a property of the arrival, and
the two doors already carry it: only INTAKE has a submitter, so only INTAKE has a declaration to
record and a consent that can be withdrawn (§8); only RESEARCHER asserts a page, so only
RESEARCHER sits on a page's timeline (§9). Nothing is left for a subclass to decide.

**What a document adds to the record beneath it: nothing — because there is no record beneath
it, and that is the whole difference from evidence.** A CAPTURE or a DIFF is a mark on a corpus
record the walk wrote, anchored as it was stored, with the archive as a witness to custody that
anyone can ask (evidence §1, §5). A document has no page, no archive timestamp, no anchor and no
witness to custody but the platform's own record of receiving the bytes handed to it, until §4
rules otherwise.
Everything the evidence design derived from the corpus record — identity, a content version,
VERIFIED — a document must supply from its own bytes or be excused from by name (evidence §10),
and every later section of this document is one of those.

**WHAT A DOCUMENT IS.** A document is bytes handed to the platform that no archive holds — a file,
a paste, a set of screenshots — named by the hash of those bytes and by nothing else.
Everything said about it — who handed it over, whom it came from, which page, authority or date
it belongs to — is an assertion by the party at the door, recorded as theirs, and believed only
as far as a researcher argues from the bytes that it should be. It becomes evidence exactly as
a corpus record does, when a researcher cites it in a thesis and argues for it (evidence §1,
§4); until then it is intake or a researcher's holding, and it is nothing else.

⚠️ As built, `EvidenceType.DOCUMENT` names the class and three unrelated formulas name its
records: the whistleblower route hashes the CIPHERTEXT it received, `create_evidence_from_text`
hashes the URL string joined to a truncated prefix of the paste, and
`recover_evidence_from_screenshot` hashes the image buffers concatenated in reading order. A
model classifies every arrival at intake — tier, role, figures, categories, summary, date — and
its output is written onto the evidence row, which the evidence design has since emptied of
prose; a submission becomes a `PENDING_REVIEW` evidence row the moment it arrives; the arrivals
are told apart only by a `sourceUrl` string, `whistleblower/thesis/<id>/gap/<n>` for one of
them. `Whistleblower` — a file hash, an encrypted contact, a consent flag — is linked to nothing
except by that hash. Nothing records whether an answer met a request.

---

## 2. IDENTITY — THE NAME FROM BYTES HANDED OVER

**A document is named by the SHA-256 of its plaintext, computed before it is sealed, and by
nothing else. Ruled 2026-09-03.** Evidence §10 set the one requirement this class must meet —
an identity composed from bytes held — and for a document there is nothing to compose: no page,
no archive timestamp, no pair. The bytes are the whole record, so their hash is the whole name.

```
DOC_ID(d)   = sha256(bytes of the file, exactly as handed over, before encryption)
```

**The vault decides what "held" means, and it follows the door. Ruled 2026-09-04.** The
platform's public promise (`/safety`) is that a document sent through the public channel is
encrypted in the sender's browser, that the sealed copy lives on IPFS and not on our servers,
that plaintext is read only in memory and never written, and that no key is kept — a system of
records that cannot produce what it does not possess. That promise is kept for EVERYTHING that
comes through the public door, because the platform cannot tell a public record from an internal
document (§1) and a wrong guess is the platform possessing what it must not. A researcher's own
door holds, because a researcher has read what they hand over. So a document is held in one of two
custody modes, decided by the door and by nothing else, and the name is the same in both:

```
SEALED   INTAKE, always. The browser strips the file's metadata, computes DOC_ID over the
         plaintext, encrypts, and sends ciphertext, key and name together. The server decrypts IN
         MEMORY, recomputes DOC_ID and refuses on mismatch, derives what §3 lets it derive, zeroes
         the plaintext, discards the key, and pins the CIPHERTEXT to IPFS. What the platform
         holds at rest: the name, the CID of the sealed copy, and the content (§3). Never the file
HELD     RESEARCHER, always. The file arrives in plaintext through MCP, attributed; the server
         computes DOC_ID and keeps the bytes. What it holds at rest: the name, the bytes, and the
         content
```

**What this costs, and how a public record becomes held.** A ministry's FOIA answer sent in by
a citizen is sealed like everything else, and the researcher reads it as its text and a model's
description — never the letterhead and signature §1 says its credibility is read from. The way
to a held copy is the researcher's own hand: the published request is theirs to send as a citizen
too (thesis T4), and the answer they receive enters through their door, held, under the same
name if the bytes are the same. **Custody is derived from what the platform holds, not stored
as a label**: a sealed document and a later held arrival of the same bytes are ONE document with
two arrivals, and it is HELD from the second one on. The platform never unseals anything itself;
it cannot.

**Why the plaintext, and why before sealing.** A name over the ciphertext gives one letter as
many names as times it was encrypted, attests only that a blob exists, and can be reproduced by
nobody who holds the original. A name over an extraction moves when the extractor does, which is
what `contentHash` did to evidence. The plaintext hash is the one name the ministry that sent
the letter, the journalist who has a copy and the source who scanned it can all recompute with
`sha256sum` and no knowledge of this platform — and the server's in-memory check at receipt is
the one moment a party that saw the original, the sealed copy and the derived content together
ties the three under it. No normalisation of any kind: a paste with a trailing newline is a
different document from one without, because it is different bytes.

**ONE FILE, ONE DOCUMENT. Ruled 2026-09-03.** The platform never composes bytes. A submission of
several files is several documents in one arrival; three photographs of a three-page letter are
three documents whose submitter says they are one letter; two screenshots of one blocked page
are two documents asserting the same page. Which files belong together is a judgement — the
submitter's at the door, the researcher's when citing — recorded as the arrival's grouping (§5)
and argued in the citation (§6), never folded into the name. An order-dependent hash over a
concatenation is a name only its author can reproduce.

**Deliberately absent from the name:** the ciphertext and its CID, the filename, the MIME type,
the arrival, the thesis and gap it was addressed to, the URL and date a researcher asserts, the
submitter's account, every extraction, every model output. Each is a pointer, an assertion, a
derivation or a circumstance; any of them in the name would make it move, or make it
uncomputable by a stranger holding only the file.

**What the name attests, and what it deliberately does not.**

| a DOCUMENT's name says | it does NOT say |
|---|---|
| exactly these bytes were handed to the platform, and the platform verified it | that the platform still holds them — SEALED, it holds a copy it cannot open |
| | since when — that is the arrival's record of receipt (§4, §5) |
| | who handed them over, or whom they came from |
| | what they depict, or that it is authentic, complete or unaltered — a photograph of a forged letter has a perfectly good name |
| | which page, authority or date they belong to — the asserter's, recorded as theirs |
| | that two arrivals of the same bytes are two documents — they are ONE document with two arrivals, and the second adds a receipt, not a name |

**RECOMPUTABLE, and by whom, differs by custody mode — and the record says which.**

```
RECOMPUTABLE(d)     HELD:    d.name = sha256(the bytes the platform holds)
                             — held at every write and audited standing; a failing row is
                               MALFORMED, never stale
                    SEALED:  VERIFIED_AT_RECEIPT(d) — the server's in-memory check, stamped as an
                             OBSERVATION with the moment it was made; the platform cannot repeat
                             it, and says so rather than pretending a standing audit
```

- **The platform** recomputes a HELD name from storage, forever. A SEALED name it verified once,
  and the stamp records what was observed, not what is believed.
- **A key holder** — if §5 rules that anyone can open a sealed copy — fetches the CID, decrypts,
  hashes, and repeats the check the server made at receipt. If §5 rules that nobody can, the
  observation at receipt is the last verification a SEALED name ever gets, and the record says so.
- **An outsider** recomputes from the original itself — the PDF the ministry sent them, the
  photograph on their phone — with no access to this platform. That is the whole reason the
  name is plain SHA-256 with nothing prepended: the check is `sha256sum file`.

**A document's IDENTITY is DOC_ID; its PUBLIC NAME is its commitment (§4).** A thesis cites
`#doc_<COMMITMENT>`, the page shows the commitment, and DOC_ID is published only with the bytes
themselves (§7) — so no hash of a copy a source held ever leaves the platform by construction.
DOC_ID does share the hash space with a capture's `documentHash`, and one equality in it is a
fact, not a collision. A document's DOC_ID is the SHA-256 of bytes; a capture's `documentHash`
is the SHA-256 of a page's bytes as served. When a researcher holds the raw bytes of a blocked page and
the archive later serves that page identically, the document's name EQUALS the capture's
`documentHash`, and the anchor the walk wrote for the capture attests the document's bytes too.
It is the one case where a document gains a witness the platform did not create, and §4 and §9
use it.

**The DIRECT class, read against this name.** The rebuild plan carried `DIRECT` — we fetched
the page and the archive has not indexed it — and `ASSERTED` — text supplied to us — as
provenance values on a CAPTURE, and evidence A1 already rules the consequence: a capture without
a `waybackTimestamp` has no CAPTURE_ID. Giving one a second formula would put a date the
platform asserts where the archive's timestamp stands, a second spelling of identity on the
corpus record. **Under this document, what a direct fetch or a supplied text yields is a
DOCUMENT, HELD: named by its bytes, with the URL and the date as the researcher's assertions.**
The capture that page may one day become, when the archive holds it, has the archive's name;
the two are tied by the researcher's assertion and, where the bytes are identical, by the
equality above. `DIRECT` and `ASSERTED` are RETIRED as provenance values: the question they
encoded — can a stranger re-check this against the archive? — is the class boundary itself. How
such a document sits on the page's timeline is §9.

⚠️ As built, the vault exists on ONE of two public paths and keeps only part of its promise.
The gap modal strips metadata and encrypts in the browser, but computes no name there; the
server names the file by its CIPHERTEXT, decrypts in memory for a model to read, zeroes, discards
the key, and pins the ciphertext to IPFS through Pinata — so nothing stored can ever be read
again and the name can be reproduced by no holder of the original. The `/submit` page posts the
file in plaintext to `/api/evidence/intake` with no declaration of channel, so a whistleblower's
file can arrive held. No text is extracted in any browser; `/safety` says the CID is anchored on
Base and no code on this path anchors anything. `Web3Service.hashFile` is SHA-256 and survives
as the function.

---

## 3. CONTENT IS A VERSION — WHAT A DOCUMENT SAYS, DERIVED FROM ITS BYTES

**Everything a document says beyond its name is derived from its bytes, and it is held as
append-only versions. Ruled 2026-09-03.** Evidence §3 rules it for a corpus record and the rule
is unchanged here: the name never moves (§2); content moves only by a new version that keeps the
old; a thesis cites a version; drift is made visible, never prevented. What is new is only what
the content IS and where it can come from.

**A document's content is TEXT, derived by an EXTRACTOR at a pinned version — or, where no
extractor can read the bytes, the bytes themselves.**

```
PDF with a text layer   the extractor reads it                       deterministic
image, scan, photo      an OCR ENGINE reads it                       deterministic at a version
paste                   the bytes ARE the text — decoded as UTF-8; one version, by construction
none of the above       no COMPUTED text exists; the content version IS the bytes, and its hash
                        is the name — the researcher reads the image, and so does the assessor
```

**Two registers, and only one is pinned** (evidence §3, Level 8):

```
COMPUTED   reproducible from the bytes by a named extractor at a pinned version — the text, or
           the bytes when there is no text → contentVersionHash. What a citation pins; what the
           ONE verdict rule checks an assertion against; what the corpus search reads
OPINION    a model's reading of the document: a transcription, a summary, a date, the actors
           it names, a category — with model and prompt version. Provenance beside the version,
           labelled as a model's, never in the hash, never pinned, never a citation
```

**The line is reproducibility, not quality.** A vision model transcribes a scanned Hebrew memo
better than any engine, and its transcription is still an OPINION: two draws differ, no one can
recompute it, and the thesis flows rule that no model output becomes a record's name, standing or
citation (§2 there). It is stored, labelled, shown beside the computed text and searchable, so a
researcher finds the document by it — and cites the computed text or the bytes. Where the engine
reads nothing and the model reads everything, the record shows exactly that, and the citation
rests on the image.

**Derivation runs on the server, in memory, at receipt, for both custody modes. Ruled
2026-09-03.** One extractor, one version to pin, one implementation to test. A SEALED document's
plaintext exists in memory exactly once (§2), and that is when its text is derived: the server
extracts, hashes, records the version, and zeroes the plaintext with the rest. Extraction in the
sender's browser was considered and is not built: it is a second extractor at a version the
platform cannot pin, yielding text it cannot check against the bytes, and it would put the
platform's only reading of a sealed document on the sender's word.

**A version is named by what it CONTAINS, not by what produced it** — evidence §3's rule,
unchanged. Its provenance is recorded beside it, and a re-derivation yielding identical text is
not a new row.

```
DocumentContentVersion                                                      ⚠️ to build
  name                    DOC_ID — the document
  text                    String | null — null when the content is the bytes
  contentVersionHash      sha256(utf8(text)) · or = name when text is null
  extractor · extractorVersion                    provenance: what read the bytes
  derivedAt · derivedFrom  AT_RECEIPT | HELD_BYTES   provenance: whether the bytes were at rest
  opinion                 Json | null — transcription, summary, date, actors, categories, with
                          model and promptVersion; the OPINION register
  @@unique([name, contentVersionHash])
```

**CURRENT is derived, and it differs by custody mode — the record says which.**

```
CURRENT(d)   HELD:    the version with extractorVersion = CURRENT_EXTRACTOR; none exists →
                      AWAITING_DERIVATION, the platform owes it (evidence A3's name, one spelling)
             SEALED:  the version derived AT_RECEIPT, forever — nothing can derive another
```

A SEALED document is the one record in the corpus whose content can never move under the
platform's own hand. A new extractor changes nothing for it; it never enters NEEDS_REVIEW by
re-derivation; its version says `AT_RECEIPT` and the reader knows what that means. That is a
cost stated, not hidden: a better OCR engine improves every HELD scan and no sealed one.

**What moves a version, and what each costs:**

| event | written by | what happens to content | what happens to a promoted document |
|---|---|---|---|
| `CURRENT_EXTRACTOR` moves | the derivation pass, over HELD bytes | a new version per HELD document whose text changed; the old kept | CURRENT moves → NEEDS_REVIEW → evidence Flow E3, unchanged |
| the same, for a SEALED document | — | nothing; there are no bytes to read | nothing |
| plaintext of a SEALED document arrives again, HELD (§2) | the receipt | derived under the current extractor; the AT_RECEIPT version is kept | if the hash differs, NEEDS_REVIEW; the researcher sees the receipt text beside the held text |
| a paste | — | nothing, ever | nothing |
| a model re-reads a document | a paid call, on a researcher's word | a new OPINION beside the version; the hash is untouched | nothing — an opinion moves no citation |

**The citation pins `(name, contentVersionHash)` on the mention**, beside its argument, exactly
as an evidence citation does (evidence §3, thesis T2); it may pin only the document's `affirmed`
version, and `affirmed` is a human's — set at promotion, moved only by REAFFIRM. **No automatic
re-affirmation, ever.**

**The ONE verdict rule reads a document's COMPUTED text, and says when it cannot.** An
assertion a model makes about a document — the framing assessor's, the critic's, the debate's —
is checked as a phrase against the current computed text and returns PRESENT or ABSENT (thesis
T1). Against a version whose content is the bytes there is no text to search, and the rule
returns neither: the assertion is recorded UNCHECKED, with the reason, and shown as such — never
silently PRESENT, never a model reading an image to grade another model. This is one amendment
to the thesis flows' rule and is named in the docs that move.

⚠️ As built, there is no extractor for a document anywhere: no PDF text library, no OCR engine,
in either tier. The only reading a document ever gets is the intake model's, under a provider
chosen by environment variable, and its structured output — summary, tier, role, date, figures,
categories — is written onto the evidence row and is what a reviewer sees; for a sealed file it
is the only thing anyone will ever see again. A paste is handed to the same model with its URL
prepended. No text version exists for any document, nothing is pinned, and a citation of the one
legacy DOCUMENT record pins a row a model wrote.

---

## 4. STANDING — WHAT ATTESTS A DOCUMENT, AND WHAT A THESIS MAY REST ON

**A document is anchored at receipt, as a capture is anchored at acquisition, by the same module,
in the deployment. Ruled 2026-09-03.** Evidence §5 rules that nothing ABOVE the corpus is
anchored — selection, argument, citation, publication are derived from the corpus and a chain
entry for a derived fact attests only that someone wrote it. A document is not above the corpus.
It has no page beneath it (§1); it IS the corpus record, the bytes themselves, and anchoring them
is the act the walk performs on every ACQUIRED capture: a hash of real bytes, written as they are
stored, attribution read from chain state. Receipt is acquisition, not research — no one selects
anything by receiving — so "no research act reaches the chain" holds as ruled, and the hazard that
rule exists for, a laptop mixing one environment's database with another's registry, has no path
here: receipt runs only in the deployment, through the intake route or the researcher's MCP tool.

**What a witness can say about a document, and which witnesses exist.** A capture has two: the
archive, which serves the URL at the timestamp to anyone, and the registry, which holds the hash
the platform stored. A document has no archive, and nothing replaces it. What it can have:

```
the record of receipt   the platform's own word: these bytes, this name, this moment, this door
the registry            a third party's timestamp: the platform held bytes with this name — or
                        had committed to them — by this block. The only witness that is not us
the CID                 SEALED only: a content address of the sealed copy. It ties the blob to
                        the name only in the platform's record, checkable only by a key holder
                        (§5); the pinning service's own timestamp is that service's word and this
                        design rests nothing on it
```

**What the anchor adds, stated once.** For the knowledge point the Prosecutor needs (plan §4),
a document shows what an office knew and when; the anchor bounds nothing about that date. What
it proves is that the bytes existed before any thesis that cites them — so no reader can say the
document was made after the claim it supports. That is the promise `/safety` makes today, in the
words "existed before any public claim", and it is kept here for the first time.

**THE ONE-MEANING RULE, ANSWERED.** Evidence §8 gives the new registry one meaning from index
zero — the SHA-256 of a page as served, checkable against the archive — and puts that scheme in
every entry's category so that "a future change of meaning is self-describing on the same
contract". A document's name is the same hash function over bytes with a different second
witness: checkable against the original by whoever holds one, never against the archive. It is a
second meaning, and it goes on the same contract under its own category, which says which:

```
every document   entry { fileHash = sha256(DOC_ID(d) ‖ salt), category = DOCUMENT_COMMITMENT }
                 salt: random at receipt, held with the record, GATED
                 the COMMITMENT is the document's PUBLIC NAME: the citation token, what the page
                 shows, what a verifier looks up. DOC_ID and the salt are served only with a
                 BYTES opening (§7), where the file itself makes DOC_ID computable by anyone
WRITES_ALLOWED    unchanged: index 0 carries the page scheme, and that is all it checks
anchors-explainable   extended: every entry's category is the page scheme or the commitment,
                      and every commitment is explained by a document row holding the salt
                      that reproduces it
```

**Why every document commits, and none is named at receipt. Ruled 2026-09-04.** A registry of
plaintext hashes lets the owner of an original hash its copy and learn that the platform holds
that exact document — and where copies are individually varied, learn who had it. A sealed
document must never be exposed that way, and a held one is anchored by the same mechanism
because one mechanism is one to test, and because the person who opens a name should be one who
has read the bytes. The commitment gives every document its date without giving anyone that
check, and opening the name later, with the salt, proves the commitment was to this document and
no other. Because the commitment is also the public name, no hash of a copy a source held is
ever published: a sealed document has no bytes to open, so its DOC_ID leaves the platform never,
and no researcher has to judge whether an authority varies its copies.

**A commitment cannot collide; its salt is fresh.** Where a HELD document's name equals a
capture's `documentHash` — the §2 equality, the bytes are a page's bytes as served — the read
shows that the walk's anchor attests the document's bytes too, and nothing is written for it.

**Receipt is never refused because the chain is unreachable. Ruled 2026-09-03.** A capture the
walk cannot anchor waits for the next pass; a whistleblower turned away by an RPC outage may
never return. So the receipt completes — name verified, content derived, bytes held or sealed —
and the anchor is OWED: ANCHORED(d) is read from chain state and is simply false until a standing
pass in the deployment anchors every document that lacks one. Nothing stores a pending state;
what closes it is the pass, and a document with no anchor says so on every read. Attribution is
never a receipt (evidence §8); the pass reads chain state as the walk does.

**The predicates a document satisfies, and how each is read.**

```
ANCHORED(d)      ATTRIBUTED(sha256(DOC_ID(d) ‖ d.salt))            evidence A3, chain state; both modes
VERIFIED(d)      RECOMPUTABLE(d) AND ANCHORED(d)                      §2's RECOMPUTABLE, by mode
CURRENT(d)       §3 — HELD under CURRENT_EXTRACTOR, or AWAITING_DERIVATION; SEALED at receipt
CITATION_CURRENT(m) · ARGUED(m) · PUBLISHABLE(m)   evidence A3, unchanged in form: PUBLISHABLE
                 composes VERIFIED(d) and CURRENT(d) where it composed the capture's
```

**What VERIFIED says for a document, and what it does not — by mode, and the flag says which.**

| | HELD | SEALED |
|---|---|---|
| VERIFIED says | the bytes the platform holds hash to the name, now; a third party timestamped a commitment to it | the platform verified the name once, at receipt, and committed to it on chain by that block; a key holder could re-verify, if §5 gives it one |
| it does NOT say | that the bytes are authentic, complete, unaltered, or from whom | the same — and that the platform can check anything again |
| the second witness | none — the archive is absent, and the flag reads so | none |

A capture's VERIFIED rests on two witnesses that are not us; a document's rests on one, and a
sealed document's on one witness and one observation. The public read carries kind, custody
mode, how the name was last verified and when, and whether it is anchored, so that a reader
weighs a document's custody against a capture's rather than being shown one word for both.

**THE NON-BINDING ARM OF EVIDENCE A6 FALLS.** That design let a DOCUMENT mention pass
`EVIDENCE_VERIFIED`, `EVIDENCE_PINNED_CURRENT` and `EVIDENCE_DERIVED` with `binding: false`,
because it could define none of them for the class. Each is now defined: VERIFIED(d) above,
CURRENT(d) in §3, and derivation at receipt or by the pass. The three checks BIND on a document
mention exactly as on a capture's, and no check has a non-binding pass. Check 17 judges DIFF
records only and, asked about a document, reports that it examined none — a check with no
subject, never a check that passed.

⚠️ As built, the gap route anchors nothing, and `/safety` says the CID is on Base. The public
`/confirm` route registers a document's hash on the OLD registry with the classifier's category
list as its label and writes `CONFIRMED` with no human step — the write §8 froze the registry
against. A registration that failed left the row `PENDING_REVIEW`, "auto-promoted while
registration was unavailable" in the schema's words — a stored status standing in for chain
state. No commitment, no salt, no standing pass exists.

---

## 5. FLOW D1 — INTAKE: FROM THE TERMS TO THE HELD BYTES

**The public's channel, from the moment a citizen reads an appeal on a published thesis to the
moment the author is told something arrived.** The prosecutor plan rules that intake is the
public's pipeline (§10); this section designs where it ends — the arrival, and the documents in
it — and the terms, the sealing and the door are designed here only as far as the record needs
them. The browser here plays a third role beside the two the thesis flows give it: it is the
PUBLIC'S DOOR, the one write an anonymous stranger makes, and it writes an arrival and nothing
else.

**Intake exists only on a published thesis. Ruled 2026-09-03.** The appeals are the published
version's (thesis T4), the door is on the public page, and a document addressed to a draft would
be addressed to a page nobody can see. A gap, when named, must be one the published version left
REQUESTED or CALLED; a thesis alone is enough for a document that answers no appeal (§1).

```
sender       reads the published thesis: a call item, a request beside a gap, or the thesis
             itself — each with the one instruction, "send it here"
browser      the intake dialog, addressed to the thesis and, from an appeal, its gap:
             THE TERMS   COMPLIANCE.md's declaration, verbatim — obtained by lawful means,
                         authorised for this investigation — accepted before anything else is
                         possible; the text shown is hashed and the hash travels with the arrival
             THE FILES   each one a document (§2). A written account, if the sender gives one,
                         is a document too — a paste, sealed like the rest
             SEALED      per file: strip metadata · DOC_ID over the plaintext · encrypt · show the
                         sender the name and the key, and after the receipt the salt and the CID
                         — ONCE, theirs to keep · send ciphertext, key and name
backend      POST — the receipt. ONE transaction per arrival, in the deployment:
             REFUSES  NOT_PUBLISHED (no published version) · NOT_AN_APPEAL (a gap not REQUESTED
                      or CALLED on it) · TERMS_NOT_ACCEPTED · NO_DOCUMENT · UNSUPPORTED_TYPE ·
                      TOO_LARGE (an operational parameter, flows A8) · UNREADABLE (the key does
                      not open the ciphertext) · NAME_MISMATCH (sha256 of the decrypted bytes ≠
                      the name sent — nothing of that file is kept)
             per document
               decrypt in memory · verify the name · derive the content (§3) · the MODEL READS
               ONCE → OPINION, labelled, on the receipt version (below) · zero the plaintext ·
               discard the key · pin the ciphertext → CID · a fresh salt
               a name already known → the same document, a further arrival (§2)
               commit through the walk's anchoring module (§4), or owe it
             the ARRIVAL: thesis · gap? · termsHash · receivedAt · its documents
             NO network identity, no account, no sender field — the row cannot say who
             ← to the sender: received · each document's commitment, salt and CID · the terms
               they accepted, verbatim. NOTHING a model said
author       told, on their next conversation or on asking (thesis T6):
             list_thesis_reviews → ARRIVED · thesis T · gap G or none · N documents
             the read (below); the command: cite it (D2, §6), or dismiss it with a reason
```

**What a model may do at receipt, and what it may not. Ruled 2026-09-03.** A sealed document's
plaintext exists once. In that moment a model may READ it — describe what it appears to be
(letterhead, form, signature, addressees, date as printed), transcribe it, summarise it — and
every word is an OPINION on the receipt version (§3), labelled, for the researcher. This is the
one paid call in this design made on a stranger's act and not on a researcher's word, because
there is no later; it is rate-limited as an operational parameter and named in §12 as a cost
measured. No model NAMES a document, writes a tier, a role, a relevance or a category onto any
row, chooses the gap, decides whether the document is kept, or says one word to the sender.

**The sender is told what they did, never what a model thought.** A model's verdict shown at the
door either turns away a true submission — "not relevant" to a stranger who knows more than the
model — or coaches a false one into the shape the model rewards. The preview that asked the
sender to confirm the AI understood their document is RETIRED: the sender's approval of a
model's reading is not a decision this design keeps anywhere, and the reading is for the
researcher.

**THE KEY HOLDER IS THE SENDER, AND ONLY THE SENDER. Ruled 2026-09-03.** The server holds a
sealed document's key for one call and discards it; the browser shows it to the sender once and
never sends it again. The platform therefore cannot produce a sealed document, not on a demand
and not for its own researcher — `/safety`'s "even from us" is literally true — and the one
party who can is the one whose safety it protects: a source who needs to prove the blob is their
document, or to re-supply the original, holds what that takes. **The researcher reads a sealed
document as its receipt text version and the labelled opinion, and never as bytes.** Where the
argument needs the original — the signature §1 says credibility is read from — the researcher
says so in the thesis's call, and the source decides whether to answer it; a public record the
researcher can obtain themselves enters held through their own door (§2).

**Two risks, and neither is an override. Ruled 2026-09-04.** Sealing protects the platform from
possessing what it cannot afford to possess — a classified document, COMPLIANCE.md's §114
exposure — and protects the sender from the platform being made to produce it. The first is the
operator's, and a stranger's permission does not lift it: the terms shift responsibility for how
a document was obtained, never for the fact that we hold it. So there is no "you may decrypt" a
sender can grant, and no channel through the public door that holds — every document through it
is sealed (§2), because the platform cannot tell a public record from an internal one and a
wrong guess is possession. The second is the sender's, and what they can waive they already
hold: the key and the CID. A source who wants the researcher to see the original hands it over
when the call asks, or hands a researcher the key outside the platform — a person's private
exposure, not platform state, and this design neither builds nor forbids it. **What sealing does
not remove, said plainly:** the platform holds the sealed document's derived text at rest (§3),
on the reading that text is the platform's own record of what a source told it and not the
authority's document. Whether that reading holds is COMPLIANCE.md's pending counsel question on
AI-derived metadata, and this design points at it rather than deciding it.

**There is no contact. Ruled 2026-09-03.** As built the sender may leave a way to be reached,
encrypted to a key the server holds — readable by the operator, and therefore by whoever can
compel the operator, which COMPLIANCE.md says is anyone with a court order. A stored route to a
source is the one piece of state a platform without press standing cannot protect, and the
safety page's promise that no identity is stored is false the moment one exists. The return
channel is the published thesis: a source who wants to say more sends more, to the same thesis,
and the author's call can say what is still needed without naming who sent what. The
alternative — a contact sealed to the thesis author's own key, held off the server — was
considered: it moves compulsion from the operator to a person, and needs a key pair per
researcher that nothing else in this design needs. `Whistleblower.encryptedContact` and the
`/contact` route are RETIRED with it.

**The intake read — what the author sees, GATED, and what it never contains.**

```
get_arrivals({ thesisId })                                                  GATED · ⚠️ to build
  returns   the thesis's arrivals, oldest first, each: { arrivalId, gapId | null, termsHash,
              receivedAt, documents: [{ name, commitment, custody, verifiedAtReceipt | recomputable,
              anchored, content: { contentVersionHash, text | null }, opinion | null — LABELLED,
              citedBy: [{ versionId, published }] }], decision: DISMISSED { reason, at } | null }
  never     a sender, an address, a key, a salt, a sealed byte
```

**What closes an arrival.** An arrival is ANSWERED when any document of it is cited by the
thesis's head or published version — derived from the mentions, never stored. Otherwise the
author may DISMISS it with a reason, one append-only decision, attributed; nothing is deleted,
and a dismissed arrival's documents keep their names, versions and commitments and may be cited
later by anyone. ARRIVED, on `list_thesis_reviews`, is every arrival that is neither.

```
ArrivalDecision   arrivalId · sequence · DISMISSED · reason REQUIRED · researcherId · createdAt
ARRIVED(t)        arrivals of t with no document cited by HEAD(t) or PUBLISHED(t) and no decision
```

**The two invariants of intake:** the door writes an arrival and its documents and nothing
else — no evidence row, no mention, no gap decision, no thesis state (evidence §1: a submission is
intake until a researcher cites and argues it); and nothing at the door is a judgement — the
custody is the door's, the gap is the appeal's, the name is arithmetic, and every model word is
an opinion on a version.

⚠️ As built, the gap modal shows no terms — COMPLIANCE.md lists the declaration as absent from
the upload flow — collects a free-text tip that is stored nowhere as a document, and, before
saving, shows the sender an AI summary, date, category, figures and "the AI did not detect
relevance to this case; you can still approve". A submission writes a `PENDING_REVIEW` evidence
row with the model's tier, role, figures and categories on it, addressed by `sourceUrl` string to
a gap INDEX that a re-run of the critic renumbers. The key is discarded and shown to nobody. The
contact is encrypted to `PII_SECRET_KEY` in the server's environment. Nothing tells the author
anything arrived, and the public `/submit` page is a second door with no thesis, no terms, no
sealing and a route that registers on the old registry with no human step.

---

## 6. FLOW D2 — FROM INTAKE TO A CITATION

**A document becomes evidence exactly as a capture or a diff does, and this section adds only
what is different about the material.** Evidence §1: a record is promoted in light of a thesis
by a researcher who cites it first and argues on the citation. Thesis T2: the citation is an
inline token, the pin is computed by the write, the argument travels with the citation. Thesis
T3 and evidence Flow E1: the debate, one per (thesis, record), SUBSTANCE hard and MERIT
advisory, promotion on the first cleared argument. None of that is restated; a document enters it
through one token and one table row.

**THE CITATION KIND, added to thesis T2. Ruled 2026-09-04.**

```
#doc_<COMMITMENT>  a DOCUMENT — by the PUBLIC NAME §4 gives it, whether or not any evidence row
                   exists yet; DOC_ID is never in a citation. get_arrivals names every document that arrived for the thesis
                   (§5), so a draft can cite it before anyone has argued for it. The mention pins a
                   CONTENT VERSION (§3) and references its argument, as an #ev_ mention does.
                   kind = DOCUMENT; the same three columns; nothing else on the mention
```

**Why a kind and not a prefix.** The mention carries nothing an EVIDENCE mention lacks. What
differs is everything around it: the name resolves to a document, not to a capture or a pair;
RECOMPUTABLE and VERIFIED are read by custody mode (§2, §4); and what publication opens for it
is §7's, not the page's. A reader of the text must be able to see, from the token alone, that
this citation rests on bytes with no archive behind them. A single `#ev_` prefix dispatching on
whatever the name resolved to would hide the one thing the token exists to show.

**THE THIRD KIND OF EVIDENCE. Ruled 2026-09-04.** A document is a corpus record (§4), so a
promoted document is an evidence row, and evidence A2's table gains one kind and one key:

```
Evidence.kind            CAPTURE | DIFF | DOCUMENT
Evidence.documentName    String? @unique — set iff kind = DOCUMENT; the CHECK constraint of
                         evidence A2 gains its third arm: exactly one key set, matching kind
Evidence.fileHash        = COMMITMENT(d) — the public name, as for every kind; ID(DOCUMENT record)
                         := COMMITMENT for RECOMPUTABLE(e), evidence A3's predicate unchanged:
                         the salt is on the document row, so the platform recomputes it, and a
                         stranger recomputes it after a BYTES opening (§7)
```

Everything else on the row and around it — `status`, `affirmed`, `EvidenceDecision`, Flow E3's
review, withdrawal, `promotedOverObjection` — is evidence's, and applies to a document without a
second spelling.

**The flow, from the author being told to the gap closing:**

```
author       list_thesis_reviews → ARRIVED, gap G, N documents                          (§5)
Claude       → get_arrivals(thesisId)                                        GATED read (§5)
             ← each document: name · custody · content — the text, or the bytes if HELD and no
               text derives — · the OPINION, labelled · anchored or owed
             → read_document(commitment)                                     GATED read · ⚠️
             ← HELD: the bytes, the current content version, the opinions
               SEALED: the receipt content version and its opinion; NO bytes exist to return
researcher   reads — with Claude, who reads the bytes or the text in the chat; a description
             Claude gives in the conversation is the conversation's, and is recorded as an
             OPINION on the version only if the researcher asks (§3, the last row of its table)
             decides the document carries a passage; writes it with Claude
Claude       → add_thesis_version(thesisId, text, claim, expectedHeadVersionId)      thesis T2
               "…the ministry's own instruction of <date> #doc_… reads that…"
backend      T2's write, with one clause: for each #doc_ mention the PIN is
               an Evidence row exists  → its affirmedContentVersionHash — the only value allowed
               none yet                → CURRENT(d).hash (§3) — the receipt version for SEALED
             REFUSES NOT_A_RECORD (no document of that name) · AWAITING_DERIVATION (HELD, no
             version under the current extractor) — T2's own refusals, one spelling
             ← unargued: the new #doc_ mention, on T3's work-list
Claude       → open_debate(thesisId, { document: commitment }, rationale)      evidence A4 · T3
backend      REFUSES NOT_CITED unless the head mentions it · NOTHING_TO_PROMOTE when CURRENT(d)
             has nothing a reader can check — a SEALED document whose content is its bytes (§3)
             · AWAITING_DERIVATION · NO_THESIS · REASON_REQUIRED · NO_RESEARCHER
             hands the ASSESSOR: the rationale · the PASSAGE (T3) · the document's CURRENT
             computed content — its text, or, HELD with no text, the bytes themselves. NEVER the
             opinion: a model's description of a letterhead is not material for judging whether
             the researcher's claims about the content can be checked
             SUBSTANCE and MERIT as E1; the ONE verdict rule on each assertion, UNCHECKED where
             the content is bytes (§3)
Claude       → respond_in_debate · promote_from_debate                          evidence A4 · T3
backend      E1's transaction: the Evidence row created iff none for this document — kind
             DOCUMENT, documentName, fileHash = commitment, affirmed = CURRENT(d).hash — else
             joined; the head's
             mention gains debateSessionId; STALE_PIN as T3. NO CHAIN WRITE: the document was
             committed at receipt (§4), and promotion anchors nothing, as evidence §5 rules
Claude       → decide_gap(thesisId, gapId, CITED, citedName = commitment)            thesis T4
backend      REFUSES NOT_CITED unless the head mentions it; the gap moves to CITED; the
             arrival is ANSWERED by derivation (§5)
researcher   readiness · publish (thesis T5); what publication opens for the document is §7
```

**What is not applicable, and says so.** `NOT_ACQUIRED`, `CONTRADICTED` and `NARROWED` are
refusals about captures and pairs; a document has none of those states, and the tools never
raise them for one. Check 17 examined none (§4).

**A SEALED document's argument stands on its text.** The researcher never sees its bytes (§5),
so what the letterhead, form or signature showed is the model's description at receipt — an
OPINION, labelled — and a rationale that leans on it makes an assertion the ONE verdict rule
records as UNCHECKED, because no computed text contains a signature. SUBSTANCE is judged on what
the rationale says about the text; the standing of what it says about the marks is the
platform's word about a model's word, and §7 says how the public page shows that. Where the
argument needs the original, the call asks for it and a HELD copy may follow (§2, §5).

**A HELD document's argument may stand on its bytes.** Where no text derives — a photograph of a
handwritten memo, a chart — the content version is the bytes (§3): the researcher reads the
image, the assessor is handed the image, and SUBSTANCE asks the same question of a claim about a
picture as of a claim about a paragraph — can it be checked against what is there. Every
assertion is UNCHECKED by the verdict rule, and the check reports that rather than passing.

**Paid: one assessor call per round, on the researcher's argument (T3); one model read of a HELD
document only when the researcher asks for it to be recorded.** Nothing here runs on a read.

⚠️ As built, a submission is a `PENDING_REVIEW` evidence row before anyone has cited it, and
becomes `CONFIRMED` through `promote_evidence` — a chain write, retired by evidence §5 — or
through the UI's promote, which bypasses the debate entirely. The published thesis cites its one
DOCUMENT record through a mention holding `type` and `refId` and no pin, and the gap it answered
is a `ThesisGapResolution` upserted from the browser on an evidence hash. No tool returns a
document's bytes to the researcher; the reviewer's page shows the model's summary and, for a
sealed file, nothing else exists to show.

---

## 7. WHAT PUBLICATION OPENS

**For a corpus record, publication opens the PAGE (evidence §5). A document has no page, and
what publication opens for it is a decision the researcher makes, per document, having read it.
Ruled 2026-09-04.** Whether these bytes name a source, carry a classification marking, or are a
public record any citizen could obtain is a fact about the bytes that only a reader knows (§1);
the door bounds the decision — a sealed document has no bytes to open — and never makes it.
Every public word about a document is therefore one of two things: the researcher's approved
text, or content the researcher chose to open. A model's reading is neither, and it never goes
public.

**What the platform enforces before any decision is made: no hash of a copy a source held is
ever published.** A document's public name is its commitment (§4), the token carries the
commitment (§6), and DOC_ID is served only with the bytes themselves, where anyone holding the
file could compute it. A sealed document has no bytes to serve, so its DOC_ID never leaves the
platform — and the question whether an authority issues individually varied copies, whose hash
would name the recipient, is one no researcher has to answer.

**THE THREE OPENINGS.** Chosen for every `#doc_` mention before the version that carries it is
published; the choice is a decision, appended and attributed, and it takes effect with the
publication, which is the one act that makes things public (thesis T5).

```
PASSAGE    nothing of the document is served. The reader gets: the commitment, its registry
           index and block time · custody and how the identity was verified (§4's table) · the
           pinned content version's hash · the citing theses and the passages that quote it —
           and the platform's attestation that each quoted phrase is present in the content it
           holds, by the ONE verdict rule, run at publication and shown as PRESENT | ABSENT |
           UNCHECKED
CONTENT    the pinned content version is served: the text — or, where the content is the
           bytes (§3), the bytes. PASSAGE's reader gets everything above as well
BYTES      the file in full, every content version, DOC_ID and the salt — so a verifier can
           hash the file, hash again with the salt, and find the registry entry — and CONTENT's
           everything. HELD only: REFUSED NOT_HELD for a sealed document, which has no bytes
           anywhere
```

```
DocumentOpeningDecision   thesisId · commitment · opening · sequence · researcherId · createdAt
OPENED(d)                 the WIDEST opening decided by any thesis whose PUBLISHED version cites
                          d — PASSAGE < CONTENT < BYTES; derived, never stored on the document
```

**Opening only widens. Ruled 2026-09-04.** A decision narrower than OPENED(d) is refused
`CANNOT_NARROW`, and a later version that drops the citation changes nothing: what the public
has read, it has read, and a public record retracted is the state this design keeps nowhere
(thesis T6, "opened pages stay open"). The one act that removes public content is not the
platform's and is §8's: a sender withdrawing what they gave.

**The readiness check this adds to thesis T5:** `DOCUMENT_OPENING_DECIDED`, hard — every
`#doc_` mention of the head has an opening decided, and none is BYTES on a sealed document. It
names the mention it examined, as every check does. This is the one judgement the platform
cannot make for the researcher — what content to open, given that quoting a memo few people saw
can identify a source through its content alone — and what the platform enforces is that it is
made explicitly, per document, before publication, by the person who read the document, and
recorded.

**Redaction is a document, not an opening.** A researcher who must publish part of a document
and not the rest makes a NEW document — the file with its redactions, or a text with its
elisions — through their own door, HELD, with its own identity and commitment, and records on it
that it derives from the original: an assertion, theirs, shown as such. They cite the redaction
and open it; the original stays committed and closed, cited by nothing. A sealed original is
redacted from its receipt text the same way. No opening mode serves "part of" a document,
because a part the platform cut would be content the platform authored under the original's
name.

**Source protection, with no press standing.** COMPLIANCE.md is plain that a court order reaches
the operator with no statutory defence. The design's answer is to hold nothing an order could
take: no sender identity, no network identity, no contact (§5), no key (§5), no plaintext of a
sealed document (§2), and a public name that reveals nothing about the bytes (§4). What remains
exposable is the content the researcher chose to open and the passages they chose to quote — and
content can identify a source when few people saw it. That is an editorial judgement no
mechanism makes, and this design leaves it where it is: with the researcher, per document, on
record. The call names units and roles, never persons (thesis T4), for the same reason.

**The classified-file exposure, and what this design does with it.** COMPLIANCE.md's §114 note
is that publishing AI-derived metadata from a classified document — dates, actors, categories —
exposes the operator even if the document is not published. Under this design that metadata is
the OPINION register (§3): GATED, labelled, read by researchers, published never. What is
published is the researcher's text and the content they opened, both approved by a human who
read the document — which is the "editorial review before publication" COMPLIANCE.md lists as
pending, made structural. The exposure that remains is the mission's: a thesis that quotes a
document says what the document says. It is taken per document, by decision, on record, and
whether that is enough is counsel's question, pointed at from here.

**A FOIA answer and a submission differ here only in what a researcher usually decides.** A
held FOIA answer is a public record lawfully obtained and will usually be opened in full; a
sealed submission usually will not be; the platform encodes neither "usually", allows the same
three openings to both, and records which was chosen and by whom.

**What the public read resolves a `#doc_` citation to** — the frontend's to render, this
document's to specify, in the shape of thesis T5's page:

```
#doc_   kind DOCUMENT · custody HELD | SEALED · the commitment, its registry index and block
        time · how the identity was last verified and when (§4's table, verbatim by mode) ·
        the second witness: NONE — stated, never implied by a shared word with captures ·
        the pinned content version's hash · the opening, and what it serves ·
        the quoted passages with their PRESENT | ABSENT | UNCHECKED ·
        a request on record, if the gap was REQUESTED: the request beside the answer (§1) ·
        argued: yes, and over objection if so — the fact (T5) ·
        the FLAG if FLAGGED(m): withdrawn · content moved (HELD only) · shed (§8)
        SEALED, always: "the platform derived this text once, at receipt; nothing can derive it
        again, and what the thesis says of the document's appearance rests on a model's reading
        the platform cannot repeat" — a fixed notice by custody, not a per-assertion verdict
NOT     the opinion · DOC_ID and the salt of any document not opened BYTES · any other document
        of the same arrival · the arrival · anything about a sender, of which there is nothing
```

`resolve_record({ fileHash })` (evidence A4) given a document's commitment answers exactly the
block above, and `NOT_PUBLIC` for a document no published version cites.

⚠️ As built, the public evidence routes serve every DOCUMENT row — its model summary, tier,
categories, figures and date, `fileUrl` and IPFS CID — to anyone, which is the §114 exposure
COMPLIANCE.md describes, live; the thesis page shows each cited row's summary and categories;
the ciphertext is on public IPFS under a CID any reader can fetch; and `/safety` says structured
metadata is the research team's while the public API serves it. No opening decision exists; a
document is public in whatever form the row holds the moment the row exists.

---

## 8. CONSENT, PRIVACY, WITHDRAWAL — WHERE "NOTHING IS DELETED" MEETS A SENDER'S RIGHT

**The declaration is the consent, and it is recorded once, by hash, on the arrival.**
COMPLIANCE.md's terms — obtained by lawful means, authorised for this investigation — are accepted
before anything is sent (§5), and the hash of the text shown travels with the arrival, so what
was agreed to is known even after the terms change. There is no separate consent row and no
consent flag: the arrival exists because the terms were accepted, and an arrival without a
termsHash is malformed. What the terms say is counsel's (COMPLIANCE.md's open task); what this
design fixes is that they are shown, accepted, and pinned.

**WITHDRAWAL IS THE SENDER'S ACT, PROVED BY THE KEY, AND HONOURED WITHOUT A DECISION. Ruled
2026-09-04.** An anonymous sender has one credential: the key the browser showed them once (§5).
Only its holder can open the sealed copy, so presenting it is proof of sending, and the platform
needs no other. Withdrawal is therefore a public act, through the same door the document came
through, and no researcher stands between the sender and it — a consent that the platform could
decline to un-give is not consent.

```
sender       returns to the platform with the commitment, the CID and the key
browser      the withdrawal dialog: commitment + key; nothing else is asked
backend      POST — ONE transaction, in the deployment:
             REFUSES NOT_A_DOCUMENT · NOT_SEALED (a held document has no sender) · WRONG_KEY
                     (the ciphertext does not decrypt, or sha256 of the plaintext ≠ DOC_ID — the
                     one moment the platform recomputes a sealed identity, and only on the key
                     holder's act) · ALREADY_SHED
             fetches the ciphertext by CID · decrypts IN MEMORY · verifies DOC_ID · zeroes
             SHED(d, cause = SENDER): below
             ← withdrawn: the commitment, the moment. Nothing else; there is nothing else
authors      told: list_thesis_reviews → FLAGGED on every mention of it — "withdrawn by its
             sender on <date>" — with the one command: a new version (thesis T6)
```

**SHED — the one destruction in this design beyond the rebuild's drop, defined once.** It
removes what the platform holds OF the document and keeps everything ABOUT it:

```
SHED(d, cause)   removes   HELD: the bytes · SEALED: the platform's pin of the sealed copy ·
                           every content version's text · every opinion on every version
                 keeps     DOC_ID · the commitment (the chain entry is immutable and would be kept
                           regardless) · every content version's HASH and provenance · the arrival
                           and its termsHash · every mention, evidence row, debate and decision ·
                           the stored PASSAGE verdicts (an observation, kept as observed) ·
                           and the shed record: commitment · cause · researcherId (OPERATOR only) ·
                           reason (OPERATOR only) · at
                 cause     SENDER — the act above, proved by the key, attributed to nobody
                           OPERATOR — a researcher's attributed act with a reason REQUIRED; when
                           it is used is COMPLIANCE.md's question with counsel (thesis §13, the
                           operator's takedown), and this design defines the act so that a
                           demand never has to be met by inventing a delete
SHED(d)          derived: a shed record exists. Custody reads as neither held nor sealed
```

**What "nothing is deleted" meant, and why this keeps it.** Evidence §6 and thesis T6 refuse
deletion so that a reader who saw a thesis can find out what happened to what it cited, and so
that no record is rewritten. Both survive SHED: the commitment, the hashes, the arrival, the
citations and the shed record say exactly what was here, when, and why it is not now. What goes
is only the content itself — which the platform must not hold once its sender has taken it back,
or once the operator is ordered not to. No row is removed; text and bytes are.

**What a shed document does to the theses that cite it.** CURRENT(d) is undefined — there is
nothing to derive from and nothing derived — so for a draft, `EVIDENCE_DERIVED` fails and names
the cause: shed, never re-derivable. For a PUBLISHED version, FLAGGED(m) gains a third arm
(evidence A3, amended by this document): withdrawn by its sender, or shed by the operator, on
<date>. The published text is not edited — the platform never changes a published version
(thesis T6) — so a passage that quoted the document stands, flagged, until its author answers
with a new version that drops or replaces it. What the public already read, it read; copies
beyond the platform are beyond it, and the page says so where a CONTENT or BYTES opening was in
force.

```
FLAGGED(m)   m is on a published version AND ( Evidence(m.name).status = WITHDRAWN
             OR NOT CITATION_CURRENT(m) OR SHED(record of m) )        — evidence A3, amended
```

**Withdrawal is per document, and it is the only thing that narrows an opening (§7).** The key
is per file, so a sender who sent three files withdraws the one they choose. Opening only widens
by the platform's hand; a sender's withdrawal is the one act that removes public content, and it
is not the platform's.

**A HELD document has no sender and no withdrawal.** It was the researcher's before it was the
platform's; the only path to shedding it is OPERATOR, with a reason, on record.

**Privacy, and what this design gives the privacy policy.** COMPLIANCE.md's privacy section asks
whether the platform operates a database of personal information. Of SENDERS it holds none, by
construction: no identity, no address, no contact, no key (§5) — there is nothing to register, and
nothing a subject-access request could return. Of THIRD PARTIES named in documents, the corpus
rule holds: records carry names as the pages — and the documents — said them, a published thesis
names no person (thesis T5), and what content of a document becomes public is the researcher's
opening decision (§7), where a document naming private individuals is opened PASSAGE or as a
redaction. The privacy policy COMPLIANCE.md owes can now state what is collected (documents and
their derived text, under the terms; no sender data), how long it is kept (until its sender
withdraws it or the operator sheds it; otherwise indefinitely), and who processes it (the
pinning service holds ciphertext it cannot read; the storage holds held bytes). Those are facts
this design fixes; the policy's text and the registration question are counsel's.

**The metadata stripper is the sender's protection, and its limit is named.** It runs in the
browser before hashing (§5) and removes what a file says about its own making — author, device,
timestamps. It does not remove what the content says: a serial number printed on a page, a name
in a header. Content-level marks are the sender's to see and the researcher's to redact (§7),
and the design promises neither party that a stripped file is an anonymous one.

⚠️ As built, `Whistleblower.consentGiven` is a boolean with no terms text, no version and no
arrival to belong to; the gap modal shows no terms at all; nothing lets a sender withdraw
anything, and the one removal that existed — `delete_evidence`, on `PENDING_REVIEW` rows — was
the platform's, unattributed, and is retired by evidence §6. The ciphertext once pinned is
never unpinned. `/safety` promises that no identity is stored while `encryptedContact` is a
column.

---

## 9. THE OTHER TWO ARRIVALS — A PAGE THE ARCHIVE LACKS, A PAGE THAT BLOCKS FETCHING

**Both are documents, HELD, through the researcher's door. Ruled 2026-09-03 (§2), stated here
with its consequences.** The factual layer parked them as acquisition problems: a live page that
blocks fetching, so acquisition needs another form — a screenshot, a text copy, a PDF — and a
page the archive never crawled. The alternative, a CAPTURE with no archive timestamp, was read
against the record's name and fell: a capture is `(url, waybackTimestamp, documentHash)` and
evidence A1 says one without a timestamp has no name; a second formula with the moment WE fetched
would put a date the platform asserts where the archive's stands, and a timeline showing the two
at one weight would tell a reader the opposite of what it means — the rebuild plan's own words
against `DIRECT` as a peer of `WAYBACK`. What a researcher holds of such a page is bytes with two
assertions, and that is a document.

**The researcher's door, one tool for every document a researcher holds:**

```
Claude       → add_document({ bytes, mimeType, assertedUrl?, assertedAt?, derivedFrom? })
                                                                          WRITE · ⚠️ to build
backend      REFUSES NO_RESEARCHER · NO_BYTES · UNSUPPORTED_TYPE · TOO_LARGE (flows A8) ·
                     NOT_SURVEYED (assertedUrl names a page with no TrackedUrl — survey it first;
                     a survey of a page the archive lacks creates the page with zero captures) ·
                     NOT_A_DOCUMENT (derivedFrom names no document)
             DOC_ID := sha256(bytes) · HELD · content derived (§3), or owed · a fresh salt ·
             committed through the anchoring module (§4), or owed
             a DOC_ID already known → the same document, a further arrival; a sealed one is
             HELD from now (§2)
             records the ASSERTIONS as the researcher's, attributed: assertedUrl — the page these
             bytes are said to show · assertedAt — when it is said to have shown them ·
             derivedFrom — the document this one is said to be a redaction or a transcription of
             (§7). None is verified; each is shown as whose it is
             ← { commitment, docId, custody: HELD, content: { contentVersionHash, text | null },
                 anchored: bool, equalsCapture: { url, capture } | null }
```

**What a researcher asserts, and what the platform can add to it.** The URL and the date are the
researcher's word, recorded as such, and the platform verifies neither. It adds one thing where it
can: the §2 equality. Where the bytes are a page's bytes as served — a saved PDF of the live page,
a raw fetch — and the archive holds or later gains a capture with the same `documentHash`, the
read says so, and the walk's anchor attests the document's bytes with two witnesses instead of
one. A screenshot never has that: its bytes are the researcher's rendering, and its standing is
§4's — custody by the platform's receipt and commitment, credibility argued from what it shows.

**How it sits on the page's timeline.** `list_findings(url)` (evidence A4) returns captures and
diffs in TIMESTAMP order, and it gains a third register that is never interleaved with them:

```
documents:  [{ commitment, assertedAt — the researcher's, labelled · custody · anchored ·
               content: { contentVersionHash } · equalsCapture | null · opening (§7) ·
               citedBy: [{ thesisId, published: true }] }]
            — every OPENED document asserting this page (§7); nothing unopened, for anyone
```

**Nothing is diffed against a document, ever.** A DIFF is two consecutive ACQUIRED captures the
walk diffed (evidence §1), and its interval is the corpus's. A pair with a document at one end
would assert an interval on a researcher's date — Level 8's boundary defect made by design. A
reader who wants to know what changed between the archive's last capture and the researcher's
screenshot reads the two; the platform computes nothing between them and claims nothing.

**The public read has one behaviour.** A page's public timeline shows the documents asserting it
that are OPENED, exactly as every reader sees them; the researcher's unopened documents are a
GATED read — `list_documents({ url? })`, every document the caller may see, with its assertions
and content — and never a second face of the public one (evidence A4's rule).

**The walk never touches a document.** The two authorities hold: the walk writes captures, text
versions, diffs and page anchors; the researcher's door writes documents and their assertions;
neither reads the other's rows to decide anything. A document asserting a page changes no rule,
no stop, no predecessor and no diff.

**What Save Page Now would change, and it does not exist.** The rebuild plan's second step —
if the archive holds nothing, ask it to create a capture — has never been called; no code
implements it, and production has surveyed one page. Were it built, it would belong to the
FACTUAL LAYER and change nothing in this document: the archive would gain a capture with the
archive's name, the survey would append it, the walk would acquire and anchor it, and the page's
timeline would gain a real capture with two witnesses. The document the researcher held stays a
document; where its bytes equal the new capture's, the read says so, and the researcher cites
the capture from then on, because a record with two witnesses is the stronger citation. For a
page that blocks the archive too, nothing changes: the document is the only record and stays so,
labelled as what it is.

**On the Prosecutor's two timelines** (plan §4), a researcher-held page is the weakest record of
"what the public was told": a page said this, on this date, on one researcher's word, with the
platform's receipt and commitment behind it and no archive. The design does not hide that
weakness under the capture's vocabulary — the timeline register, the custody line and the absent
second witness say it — and a thesis that rests a public-timeline claim on one should expect the
critic to say so.

**RETIRED, and what each was:**

```
create_evidence_from_text        a paste hashed with its URL, classified by a model, written as
                                 evidence → add_document: a paste is a document, the URL its
                                 assertion, the text its own content version
recover_evidence_from_screenshot up to ten images concatenated in caller order into one name,
                                 with a failedUrl and a failureReason → add_document, once per
                                 image (§2: one file, one document); the reason for capturing by
                                 hand is the citation's argument, not a column
DIRECT · ASSERTED                provenance values on a capture (§2)
the public screenshot-recovery route   open submission of screenshots as evidence → intake (§5):
                                 a member of the public sends a screenshot to a thesis, sealed,
                                 like any document
```

`docs/gf-blocked-url-recovery-dev-plan.md` is SUPERSEDED by this section: its permission model,
its multi-screenshot record, its reviewer page and its `DIRECT` fallback each have a successor
above or none.

⚠️ As built, the two tools exist as described, `Evidence.additionalScreenshotUrls` holds captures
two to ten of one record, `UrlSnapshot.provenance` is a `CaptureProvenance` of
`WAYBACK | DIRECT | ASSERTED`, `get_forensic_timeline` shows no document at all, and a document
with a `sourceUrl` sits in the evidence table beside diffs with no relation to the page's
timeline.

---

## 10. LEGACY — ONE PARAGRAPH

**Nothing of the DOCUMENT class as built is carried, and evidence §8 already ruled why: the
database is disposable, the chain is not.** The one DOCUMENT record the published thesis cites
is not migrated into the rebuilt database; the thesis is its author's to write again under the
thesis flows, and if that document is wanted it re-enters through the researcher's door as a
HELD document with its own commitment (§9), or through intake, sealed, if its source sends it
again. `Whistleblower` — a ciphertext hash, an encrypted contact, a consent boolean — goes with
the database and has no successor: the arrival, its termsHash and the sender's own key are what
replace it (§5, §8). `Evidence`'s DOCUMENT columns — `sourceUrl`, `fileUrl`,
`additionalScreenshotUrls`, `ipfsCid`, `intakeVersion` — and `EvidenceCapture`, `KeyFigure` and
`SummaryCorrection` go with it, as evidence A2 and thesis A2 already rule for the rows around
them. The two intake tools and the public screenshot route are RETIRED (§9); the `/submit` page
and its `/intake`, `/confirm` and `/contact` routes are RETIRED (§5), and the gap route is
re-shaped into the one intake door (§5, A5). The eight evidence names the old production registry
holds under the retired formula are explained, index by index, in the registry ledger evidence §8
emits, and no document row is ever explained by them. The ciphertexts already pinned to public
IPFS under the old flow are unpinned by the platform with the database — what other nodes hold,
the platform cannot reach and does not claim to. Nothing here runs a migration, a backfill or a
repair: the legacy rows make no false claim once the public routes that served them are gone, and
a row that is merely unexplained is archaeology (`CLAUDE.md`).

---

## 11. STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| the Document row: DOC_ID (GATED), the salt (GATED), the CID (SEALED), the bytes (HELD) | the intake receipt (§5) · `add_document` (§9) — the two doors, in the deployment | the walk · a model · any read · anything after receipt except SHED |
| the receipt verification stamp — SEALED: DOC_ID verified in memory, at this moment | the intake receipt, once | anything later; it is an observation, never refreshed |
| the Arrival: thesis · gap? · termsHash · receivedAt · its documents | the intake receipt | a researcher · the walk · a model |
| the researcher's assertions: assertedUrl · assertedAt · derivedFrom | `add_document`, attributed | intake · a model · anything that could verify them, because nothing can |
| `DocumentContentVersion`: text · hash · extractor · version · derivedFrom | the extractor at receipt (both doors) · the derivation pass over HELD bytes when `CURRENT_EXTRACTOR` moves | any research act · a model · anything, for a SEALED document, after receipt |
| the OPINION register on a version | the model's one read at receipt (SEALED) · a read the researcher asked to have recorded (HELD) | the extractor · anything that publishes |
| the commitment on the registry: `sha256(DOC_ID ‖ salt)`, category `DOCUMENT_COMMITMENT` | the anchoring module — at receipt, or the standing pass for what is owed — in the deployment | any research act · MCP directly · a second caller of `submit` |
| the Evidence row, kind DOCUMENT: `fileHash = commitment` · `documentName` · `affirmed` · status | `promote_from_debate` on the first cleared argument · `review_evidence` — evidence §9, unchanged | intake · the doors · the walk |
| the mention, kind DOCUMENT: commitment · pin · argument | the thesis version write (T2) · `promote_from_debate` for the argument (T3) | any document tool |
| `ArrivalDecision` DISMISSED, with reason | the thesis author | anyone else · anything automatic |
| `DocumentOpeningDecision` | the thesis author, before publication; in force from `publish_thesis` | the door · a model · anything that narrows |
| the PASSAGE verdicts — PRESENT · ABSENT · UNCHECKED per quoted phrase | `publish_thesis`, once, against the content then held | anything later; kept as observed, even after SHED |
| the shed record: commitment · cause · researcherId and reason (OPERATOR) · at | the withdrawal door on the sender's key (SENDER) · a researcher, with reason (OPERATOR) | anything automatic · a model · the walk |
| what SHED removes — bytes · the platform's pin · every text · every opinion | the SHED act, and only it | anything else, ever |
| the sender's key and salt | shown once by the browser; held by the sender | the platform, anywhere, after the receipt call |

**Derived, never stored:** custody (HELD · SEALED · neither), `RECOMPUTABLE` by mode, `ANCHORED`,
`VERIFIED`, `CURRENT`, `AWAITING_DERIVATION`, the §2 equality with a capture, `ARRIVED`,
`ANSWERED`, `OPENED`, `SHED(d)`, and `FLAGGED` with its third arm. A predicate a pass computed
and stored would be a judgement the pass made.

**Four writers, and what each may touch — the two authorities of the flows, extended by two.**
The public door writes arrivals and documents and nothing above them. The researcher's tools
write held documents and their assertions, decisions, openings and — through the evidence and
thesis flows — promotions and citations, and never a content version or a registry entry. The
platform's own passes — the extractor over held bytes, the anchoring module for what is owed —
write content versions and commitments, in the deployment, and never a decision. The walk writes
the corpus and touches no document. Models write opinions, labelled, and nothing else.

**Nothing is deleted, with one act.** Rows are appended, statuses move forward, versions and
decisions accumulate; SHED removes content and keeps every row about it, and is defined once
(§8). The single deletion beyond it is the rebuild's drop (evidence §8), once per environment,
in its own session.

---

## 12. OUT OF SCOPE OF THIS DESIGN

Each is named so that it is not read as a gap. None is decided here; each says whose it is.

- **The intake dialog's rendering** — how the terms are shown, how the sender is shown their key,
  salt and CID once, how the withdrawal dialog asks for them; the frontend's, against §5 and §8.
- **The public page's rendering of a document** — a `#doc_` citation by opening and custody, the
  SEALED notice, the documents register on a page's timeline; the frontend's, against §7 and §9.
- **The `/safety` page's copy** — it promises the CID on chain, structured metadata for the
  research team, and no identity stored while a contact column exists; it is rewritten to what §2,
  §4, §5 and §8 build, and that is the frontend's change, named in the docs that move.
- **Counsel's questions, each pointed at from where it arises** — whether a sealed document's
  derived text at rest is the platform's record or the authority's document (§5); whether the
  researcher's opening decision is the editorial review COMPLIANCE.md's §114 note asks for (§7);
  when, if ever, the OPERATOR cause of SHED is used (§8); the wording of the terms (§5); the
  privacy policy's text and the registration question (§8). This design gives each its facts and
  decides none.
- **The extractor** — which PDF text library, which OCR engine, how it reads Hebrew and scans; the
  build's choice, judged by the coverage measured below, never by this document.
- **Save Page Now** — the factual layer's, if it is ever built; §9 says what would and would not
  change here.
- **The pinning service and the storage** — infrastructure. The design requires content addressing
  of the sealed copy and that the platform can release its own pin, and names no provider.
- **Operational parameters** — the size cap, the supported types, the rate limit on the receipt's
  paid read; flows A8's kind, not judgements.
- **The Prosecutor's reading of documents** — its material gains every document's COMPUTED text
  as the knowledge point (plan §4); its hook is the thesis flows' §10, and nothing here changes it.
- **Search over documents' text beyond a phrase** — with evidence §10's read-tool design; the
  opinion register is searchable there, labelled, and the design of that search is not this one.
- **The thesis flows' mechanics** beyond the token, the arrival, the opening check and the verdict
  rule's third value — theirs, unchanged.
- **Bronze Fortress** — untouched by every ruling here, including the registry's second category.

## VERIFIED BY MEASUREMENT, NOT BY THIS DOCUMENT

Each is a number this design assumes or a cost it states, checked by an instrument rather than
argued. Every one runs read-only, in the container, and lands in a dated findings document.

| what | why it is measured | where it bears |
|---|---|---|
| documents received, per thesis and per gap, by door | whether the return path is a scenario the platform meets, and whether the researcher's door is used at all | §1, §5, §9 |
| the age of ARRIVED entries — receipt to the author's first read or decision | what the author owes and how long a sender waits to matter | §5 |
| dismissed arrivals as a share of arrivals | what the door lets through that no thesis needs, and whether the terms deter | §5 |
| paid reads at receipt, and their cost | the one paid call made on a stranger's act; the abuse pressure the rate limit is set against | §5 |
| extractor coverage — documents with COMPUTED text against documents whose content is their bytes, by type and by door | whether the OCR engine earns its place, and how many citations rest on an image | §3 |
| UNCHECKED verdicts on assertions about documents, sealed against held | how much of a sealed document's credibility rests on a model's reading the platform cannot repeat | §3, §6, §7 |
| documents owed a commitment, and the age of the oldest | whether the standing pass is needed or an RPC outage at receipt is rare enough to ignore | §4 |
| the §2 equality — documents whose DOC_ID equals a capture's `documentHash` | whether the one witness the platform did not create ever appears | §2, §9 |
| openings chosen — PASSAGE, CONTENT, BYTES — by custody | whether a document is ever public in full, and whether PASSAGE is the norm for a sealed one | §7 |
| SHED by cause — SENDER, OPERATOR | whether the withdrawal door is used, and whether the operator cause ever fires | §8 |
| documents asserting a page, per surveyed page with zero captures | whether Save Page Now is ever worth building | §9 |

**Nothing is OPEN.** What this document does not decide is named above as someone else's or as
a number; the appendix that follows is the contract for everything it does decide.

---

## APPENDIX — THE IMPLEMENTATION CONTRACT

**What a builder reads twice.** Every shape, predicate and refusal the flows above imply, stated
once. It composes with `docs/gf-interaction-flows.md` A1–A8, `docs/gf-evidence-flows.md` A1–A7
and `docs/gf-thesis-flows.md` A1–A7 — the page, the capture, `Evidence`, `DebateSession`,
`ThesisMention`, the predicates, the checks — and restates none of them. Where the flows above
and this appendix disagree, the flows win and this is wrong.

### A1. Identity

```
document          named on every tool, page and citation by its COMMITMENT; DOC_ID is GATED
DOC_ID(d)         sha256( bytes )
                  bytes: the file exactly as handed over — SEALED: after the browser's metadata
                  strip, before encryption, so what was handed over IS the stripped file;
                  HELD: as the researcher gave it, unstripped. No normalisation of any kind
COMMITMENT(d)     sha256( bytes32(DOC_ID(d)) ‖ salt )
                  salt: random bytes of the hash's width, generated by the platform at receipt —
                  never by the sender — stored on the row, GATED
ID(DOCUMENT record)   COMMITMENT(d) — what Evidence.fileHash holds, what the registry holds, what
                  RECOMPUTABLE(e) compares
token             #doc_<COMMITMENT>   thesis A1's token grammar, one kind added
contentVersionHash    DOCUMENT: sha256( utf8(text) ) over the extractor's output as emitted;
                  = DOC_ID(d) when the content is the bytes (§3)
display           0x + 64 lowercase hex for every hash above — evidence A1's form
DOCUMENT_COMMITMENT   the registry category on every document entry — one constant, one importable
                  symbol, beside ANCHOR_SCHEME; WRITES_ALLOWED reads index 0 only and is unchanged
CURRENT_EXTRACTOR one constant naming the extractor and its version; the PDF reader and the OCR
                  engine are its parts — the document analogue of flows A2's textExtractionVersion
arrival           arrivalId (cuid) — GATED, never public
researcher        from the MCP context on the researcher's door; ABSENT by construction on the
                  public door
```

**Two implementations of one hash are unavoidable, and the receipt tests them.** The browser
computes DOC_ID with WebCrypto over the stripped bytes; the server recomputes it with its own
SHA-256 over the decrypted bytes; `NAME_MISMATCH` (§5) is the check that they agree, run on every
sealed document at every receipt. A test vector shared by both is in the suite.

### A2. Data model

```
Document                                                                    ⚠️ to build
  docId                    @unique — DOC_ID; GATED, served only with a BYTES opening (§7)
  commitment               @unique — the public name (A1)
  salt                     Bytes — GATED
  cid                      String? — the sealed copy's content address; set on a sealed arrival
  bytes                    storage reference | null — set on a held arrival; null after SHED
  mimeType · byteLength
  receivedAt               the first arrival's moment
  verifiedAtReceipt        DateTime? — the SEALED stamp: DOC_ID recomputed in memory then (§2)
  assertedUrl · assertedAt · derivedFromCommitment
                           String? each — the researcher's door only; attributed through the
                           arrival's researcherId; derivedFromCommitment must name a Document
  custody                  DERIVED, never a column: HELD iff bytes present · SEALED iff cid
                           present and bytes absent · NONE iff a Shed row exists
  INVARIANT (HELD)         sha256(bytes) = docId — held at every write of bytes

Arrival                                                                     ⚠️ to build
  id · door                INTAKE | RESEARCHER
  thesisId                 String? — REQUIRED iff INTAKE (§5); a researcher's document is
                           addressed to nothing — a CHECK constraint
  gapId                    String? — INTAKE only; REQUESTED or CALLED on the published version
  researcherId             String? — REQUIRED iff RESEARCHER; NULL iff INTAKE — a CHECK constraint
  termsHash                String? — REQUIRED iff INTAKE — a CHECK constraint
  receivedAt
  documents                ArrivalDocument: arrivalId · commitment  @@unique — the grouping (§2)
  NO column for a network address, an account, a name or a contact — a source scan holds that
  none is ever added

ArrivalDecision          append-only
  id · arrivalId · sequence  @@unique([arrivalId, sequence])
  decision                 DISMISSED — the one value; ANSWERED is derived (A3)
  reason                   REQUIRED
  researcherId · createdAt

DocumentContentVersion   append-only, §3's row
  id · commitment
  text                     String | null — null when the content is the bytes
  contentVersionHash       A1
  extractor · extractorVersion · derivedAt
  derivedFrom              AT_RECEIPT | HELD_BYTES
  opinion                  Json | null — the OPINION register: transcription, description,
                           summary, date, actors, categories, model, promptVersion
  @@unique([commitment, contentVersionHash])
  text and opinion are NULLED by SHED; the row, its hash and its provenance stay

DocumentOpeningDecision  append-only
  id · thesisId · commitment · sequence  @@unique([thesisId, commitment, sequence])
  opening                  PASSAGE | CONTENT | BYTES
  researcherId · createdAt
  REFUSED at write: CANNOT_NARROW (below OPENED(d)) · NOT_HELD (BYTES on a sealed document)

PassageVerdict           written by publish_thesis, once per published version
  id · versionId · mentionId · phrase · verdict  PRESENT | ABSENT | UNCHECKED · at
  phrase: each quoted span — text in quotation marks — of the paragraph that carries the
  token (thesis T3's PASSAGE), checked by the ONE verdict rule against CURRENT(d).text
  kept as observed, even after SHED

Shed
  commitment               @unique — one shed per document, ever
  cause                    SENDER | OPERATOR
  researcherId · reason    String? each — REQUIRED iff OPERATOR; NULL iff SENDER — a CHECK
  at

Evidence                 evidence A2, one kind and one key added
  kind                     CAPTURE | DIFF | DOCUMENT
  documentCommitment       String? @unique — set iff kind = DOCUMENT; the CHECK constraint's
                           third arm: exactly one of snapshotId · urlVersionDiffId ·
                           documentCommitment is set, matching kind
  fileHash                 = commitment for kind DOCUMENT

ThesisMention            thesis A2, one kind added
  kind                     EVIDENCE | TRAJECTORY | DOCUMENT
  name                     the commitment for kind DOCUMENT
  contentVersionHash       REQUIRED on DOCUMENT, computed as T2 rules, from Evidence.affirmed
                           where a row exists else CURRENT(d)
  debateSessionId          as EVIDENCE

DebateSession            evidence A2, one key added
  recordCommitment         String? — one of recordSnapshotId · recordDiffId · recordCommitment
                           set, matching the record's kind; recordFileHash = the commitment

ThesisGapDecision        thesis A2: citedName may be a commitment the head mentions

registry entry           { fileHash = COMMITMENT(d), submitter, block time,
                           category = DOCUMENT_COMMITMENT } — written by the anchoring module;
                           the contract is unchanged

REMOVED from the schema: Whistleblower · Evidence.sourceUrl · fileUrl · additionalScreenshotUrls ·
ipfsCid · intakeVersion · EvidenceCapture · CaptureProvenance's DIRECT and ASSERTED
```

**Nothing is deleted, ever, after the rebuild, except by SHED** — which nulls text, opinion and
bytes and releases a pin, and removes no row (§8).

### A3. Derivations, as predicates

```
DOC_ID · COMMITMENT       A1
CUSTODY(d)                HELD | SEALED | NONE — A2's derivation
RECOMPUTABLE(d)           HELD:   sha256(bytes) = docId — held at every write, audited standing
                          SEALED: verifiedAtReceipt is set — an observation, never re-evaluated
                          NONE:   what was last recorded, as recorded
RECOMPUTABLE(e)           kind DOCUMENT: e.fileHash = sha256(bytes32(d.docId) ‖ d.salt) for the
                          Document keyed by e.documentCommitment — evidence A3's predicate, third arm
ANCHORED(d)               ATTRIBUTED(d.commitment)                             evidence A3
VERIFIED(d)               RECOMPUTABLE(d) AND ANCHORED(d)
CURRENT(d)                HELD:   the DocumentContentVersion with extractorVersion =
                                  CURRENT_EXTRACTOR; none → AWAITING_DERIVATION (evidence A3's name)
                          SEALED: the version with derivedFrom = AT_RECEIPT, forever
                          NONE:   undefined — EVIDENCE_DERIVED fails naming SHED, never AWAITING
CITATION_CURRENT(m) · ARGUED(m) · NEEDS_REVIEW(e)       evidence A3, unchanged, over CURRENT(d)
PUBLISHABLE(m)            evidence A3, composing VERIFIED(d) and CURRENT(d) where it composed the
                          capture's; and DOCUMENT_OPENING_DECIDED (A6) on the version
ANSWERED(a)               ∃ document of arrival a cited by HEAD(a.thesis) or PUBLISHED(a.thesis)
ARRIVED(t)                INTAKE arrivals of t with no ArrivalDecision and NOT ANSWERED
OPENED(d)                 max over DocumentOpeningDecision in force for (t, d) where PUBLISHED(t)
                          cites d, PASSAGE < CONTENT < BYTES; none → d is not public
PUBLIC(d)                 OPENED(d) is defined — per document, never per page; there is no
                          PUBLIC_PAGE analogue and no "the sender's other documents"
SHED(d)                   a Shed row exists for d.commitment
FLAGGED(m)                evidence A3's FLAGGED OR SHED(record of m)         — amended
EQUALS_CAPTURE(d)         ∃ UrlSnapshot with documentHash = d.docId — read on demand; the read
                          names the page and capture
VERDICT(phrase, d)        the ONE verdict rule (thesis T1) over CURRENT(d).text → PRESENT | ABSENT;
                          CURRENT(d).text is null → UNCHECKED, with the reason  — amended
```

**Every predicate is computed on read and none is stored.** The two stamps — `verifiedAtReceipt`
and `PassageVerdict` — are observations with their moment, kept as observed, and a predicate that
reads one says it is reading a stamp.

### A4. Tool contracts

**Conventions, shared with flows A5, evidence A4 and thesis A4.** Every refusal is a JSON
`{ error, code }`, never a throw. Every write REFUSES without a researcher (`NO_RESEARCHER`) and,
on a thesis, unless the caller is its author (`NOT_AUTHOR`). A document is named on every tool by
its COMMITMENT; a name that resolves to none is `NOT_A_DOCUMENT`. PUBLIC reads take no identity
and answer identically for everyone; GATED reads answer any researcher. Where CURRENT(d) is
undefined the tool refuses `AWAITING_DERIVATION` (HELD, no version under the current extractor)
or `SHED` (naming cause and date), never a guess. Every paid call is named as one.

```
add_document({ bytes, mimeType, assertedUrl?, assertedAt?, derivedFrom? })   WRITE · ⚠️ to build
  does      §9: DOC_ID · HELD · content derived or owed · salt · commitment written or owed ·
            an Arrival(door = RESEARCHER) · the assertions recorded as the caller's
  returns   { commitment, docId, custody: 'HELD', content: { contentVersionHash, text | null } |
              null (awaiting), anchored, equalsCapture: { url, capture } | null,
              existed: bool (the same bytes were already a document) }
  refuses   NO_BYTES · UNSUPPORTED_TYPE · TOO_LARGE · NOT_SURVEYED (assertedUrl has no
            TrackedUrl) · NOT_A_DOCUMENT (derivedFrom)

get_arrivals({ thesisId })                                                   GATED · ⚠️ to build
  returns   §5's shape, oldest first; documents carry commitment, custody, verification,
            anchored, content, opinion LABELLED, citedBy (published and head), decision
  refuses   NO_THESIS
  never     a sender, an address, a key, a salt, DOC_ID, a sealed byte

dismiss_arrival({ arrivalId, reason, expectedSequence })                    WRITE · ⚠️ to build
  does      appends ArrivalDecision DISMISSED
  refuses   NOT_AUTHOR · NO_SUCH_ARRIVAL · ANSWERED (a document of it is cited — nothing to
            dismiss) · REASON_REQUIRED · STALE_SEQUENCE

read_document({ commitment })                                                GATED · ⚠️ to build
  returns   HELD:   { custody, docId, bytes, versions: [{ contentVersionHash, text, provenance,
                      opinion LABELLED }], current, anchored, equalsCapture, assertions }
            SEALED: { custody, verifiedAtReceipt, cid, version: the AT_RECEIPT one with its
                      opinion LABELLED, anchored } — no bytes exist to return
            NONE:   { custody: 'NONE', shed: { cause, at }, hashes only }
  refuses   NOT_A_DOCUMENT

list_documents({ url? })                                                     GATED · ⚠️ to build
  returns   every document, or every document asserting url, with custody, assertions,
            current hash, anchored, citedBy, opening; oldest first
  refuses   NOT_SURVEYED (url given and unknown)

describe_document({ commitment })                                     WRITE · paid · ⚠️ to build
  does      a model reads a HELD document's bytes on the researcher's word and its reading is
            appended as the OPINION of CURRENT(d) — §3's last row; never a citation
  refuses   NOT_A_DOCUMENT · NOT_HELD (a sealed document was read once, at receipt) ·
            AWAITING_DERIVATION (an opinion attaches to a version)

decide_opening({ thesisId, commitment, opening, expectedSequence })          WRITE · ⚠️ to build
  does      appends DocumentOpeningDecision; in force from the next publish_thesis
  refuses   NOT_AUTHOR · NOT_CITED (the head does not mention it) · NOT_HELD (BYTES, sealed) ·
            CANNOT_NARROW (below OPENED(d)) · STALE_SEQUENCE

shed_document({ commitment, reason })                             WRITE · OPERATOR · ⚠️ to build
  does      §8's SHED with cause OPERATOR, attributed; when it is used is counsel's (§12)
  refuses   NOT_A_DOCUMENT · ALREADY_SHED · REASON_REQUIRED

add_thesis_version          thesis A4 — parses #doc_ tokens into kind DOCUMENT mentions; pin as
                            T2 over CURRENT(d); refuses NOT_A_DOCUMENT · AWAITING_DERIVATION · SHED
open_debate · promote_from_debate · respond_in_debate · get_debate
                            evidence A4 — record may be { document: commitment }; refuses
                            NOTHING_TO_PROMOTE when CURRENT(d).text is null on a SEALED document;
                            NOT_ACQUIRED · CONTRADICTED · NARROWED never raised for a document
decide_gap                  thesis A4 — citedName may be a commitment the head mentions
publish_thesis              thesis A4 — runs A6's two added checks · writes PassageVerdict per
                            quoted span · the openings decided come into force · opened: [url…]
                            gains documentsOpened: [commitment…]
list_thesis_reviews         thesis A4 — ARRIVED gains its shape: { arrivalId, gapId | null,
                            documents: [commitment…], receivedAt, commands } · FLAGGED gains the
                            SHED arm's text
list_findings({ url })      evidence A4 — gains the `documents` register (§9): OPENED only
resolve_record({ fileHash })  evidence A4 — a commitment resolves to §7's public block;
                            NOT_PUBLIC unless OPENED(d)
check_on_chain_status({ commitment })  evidence A4 — asked about a commitment, answers about its
                            entry: registered · ATTRIBUTED · block time · category
review_evidence             evidence A4 — unchanged over kind DOCUMENT
```

**Retired, and what each was:**

```
create_evidence_from_text          a paste hashed with its URL, classified into a row → add_document
recover_evidence_from_screenshot   images concatenated into one name → add_document, one per image
```

### A5. Routes

**Two public writes and two public serves, and every other document route is retired.** The
public door is the browser's, so it is a route (thesis §2's dialog rule does not apply: the
sender is not a researcher and returns no command); everything a researcher does is a tool.

```
POST /api/thesis/:thesisId/intake                                    PUBLIC write · ⚠️ re-shaped
  body      { gapId?, termsHash, files: [{ ciphertext, key, docId, mimeType, filename? }] }
  does      §5's receipt, ONE transaction; the model's one read; the commitment or its debt
  returns   { arrivalId?: never — the sender gets no handle; documents: [{ commitment, salt,
              cid }], terms: the text accepted, verbatim }
  refuses   NOT_PUBLISHED · NOT_AN_APPEAL · TERMS_NOT_ACCEPTED (termsHash ≠ the hash of the
            terms currently shown) · NO_DOCUMENT · UNSUPPORTED_TYPE · TOO_LARGE · UNREADABLE ·
            NAME_MISMATCH — each per file where it is a file's
  limits    the receipt's paid read is rate-limited; an operational parameter (flows A8)
  never     reads or writes a network address, a cookie, an account

POST /api/documents/withdraw                                          PUBLIC write · ⚠️ to build
  body      { commitment, key }
  does      §8: fetch by CID · decrypt in memory · verify DOC_ID · zero · SHED(SENDER)
  returns   { commitment, shedAt }
  refuses   NOT_A_DOCUMENT · NOT_SEALED · WRONG_KEY · ALREADY_SHED

GET /api/documents/:commitment/content                                PUBLIC serve · ⚠️ to build
  does      serves CURRENT(d)'s pinned content — text, or bytes where the content is the bytes
  refuses   NOT_PUBLIC (not OPENED) · NOT_OPENED_TO (OPENED(d) = PASSAGE) · SHED

GET /api/documents/:commitment/bytes                                  PUBLIC serve · ⚠️ to build
  does      serves the file, and { docId, salt } beside it, so a reader can reproduce the
            commitment from the file
  refuses   NOT_PUBLIC · NOT_OPENED_TO (OPENED(d) < BYTES) · NOT_HELD · SHED

RETIRED   /submit's POST /api/evidence/intake · /confirm · /contact · the screenshot-recovery
          route · POST /api/thesis/:id/gaps/:gapIndex/whistleblower/preview · every /api/evidence
          route that served a DOCUMENT row's file, CID or model prose
```

The public thesis page and `list_findings`' documents register are tool-shaped reads the
frontend calls (evidence A5's rule), not routes of this design.

### A6. The checks a thesis runs

**The publication gate consumes A3's predicates, one check per predicate, each naming the mention
it examined.** Evidence A6's six checks bind on a DOCUMENT mention through the predicates defined
here; two checks are added; one is amended.

| check | under this design |
|---|---|
| `EVIDENCE_VERIFIED` | VERIFIED(d) — RECOMPUTABLE by mode and ANCHORED; **the non-binding arm of evidence A6 FALLS**; hard |
| `EVIDENCE_PINNED_CURRENT` | CITATION_CURRENT over CURRENT(d); for a sealed document always true unless SHED; hard |
| `EVIDENCE_DERIVED` | CURRENT(d) defined; the failure names AWAITING_DERIVATION (held, the pass owes it) or SHED (never re-derivable); hard |
| `EVIDENCE_ARGUED` · `EVIDENCE_NOT_WITHDRAWN` | unchanged |
| `EVIDENCE_DIFF_INPUT_SOUND` (17) | judges DIFF records only; for a DOCUMENT mention reports that it examined none — a check with no subject, never a pass |
| `CITES_EVIDENCE` | **amended**: satisfied by an EVIDENCE or a DOCUMENT mention — a document is a corpus record, and a thesis resting on documents alone argues from what the corpus holds, with each citation's custody and absent second witness in view |
| new `DOCUMENT_OPENING_DECIDED` | every `#doc_` mention of the head has a DocumentOpeningDecision, and none is BYTES on a sealed document; hard |
| new `DOCUMENT_QUOTES_PRESENT` | every quoted span of every paragraph carrying a `#doc_` token is PRESENT or UNCHECKED by VERDICT; an ABSENT span names itself — the researcher quoted a document a phrase it does not contain; hard |
| `NAMES_NO_PERSON` · the rest | unchanged; a document's content may name persons, the version may not |

**The verdict rule's third value is this document's amendment to thesis T1**: UNCHECKED, with its
reason, wherever the content is bytes, for the assessors' and the critic's assertions and for the
quoted spans alike — one implementation, one symbol.

### A7. The instruments, and what each turns from a claim into a measurement

Every instrument runs read-only inside a deployment, environment stated twice (`CLAUDE.md`), and
writes its own ledger record. None is proven until it has been observed to FAIL.

```
document-recomputable        §2, §4     npm run forensics:audit-documents -- --env <env>
  every HELD document: sha256(bytes) = docId · every SEALED document: verifiedAtReceipt set ·
  every Evidence kind DOCUMENT: fileHash = sha256(docId ‖ salt) of its document
  exit 0: all pass · exit 1: malformed rows, listed — never repaired

anchors-explainable          evidence A7, extended
  every entry's category ∈ { ANCHOR_SCHEME, DOCUMENT_COMMITMENT }; every commitment entry is
  reproduced by one Document row's (docId, salt); exit 1 on an unexplained entry, by index

commitments-owed             §4         npm run forensics:commitments-owed -- --env <env>
  documents with no ATTRIBUTED commitment, with age — the standing pass's input
  exit 0: none owed · exit 2: owed, listed — an expected state, never a failure

no-plaintext-at-rest         §2, §5     a source scan and a test, in the suite
  no write path under src/ stores the decrypted bytes of an INTAKE arrival; the receipt's
  plaintext buffer is zeroed on every exit path, including refusals — a test that fails when
  a reference to it survives the handler

no-sender-identity           §5, §8     a schema and source scan, in the suite
  Arrival and Document have no column for an address, an account, a name or a contact; the
  intake and withdrawal handlers read no request address into any write; Whistleblower absent

opinions-not-facts           evidence A7, extended to every document read
  `opinion` is a separate object from `content` on get_arrivals, read_document, list_findings'
  documents register; absent from every PUBLIC read

one-hash-two-implementations §2, A1     the shared test vector, in both suites
  the browser's and the server's SHA-256 agree on the vector; NAME_MISMATCH fires when one is
  altered

verdict-rule-one-spelling    §3, A6     a source scan
  one importable symbol computes PRESENT | ABSENT | UNCHECKED; PassageVerdict, the framing
  assessor's audit and the critic's audit call it; nothing else spells it

retired-names                the factual layer's step-0 scan, extended by A4 and A5's lists
```

**The measurements of §12 are instruments too**, read-only by construction:

```
forensics:count-documents -- --env <env>        per thesis, per gap, per door; dismissed share
forensics:arrivals-age -- --env <env>            ARRIVED entries and their age
forensics:extractor-coverage -- --env <env>      COMPUTED text against bytes-only, by type and door
forensics:document-openings -- --env <env>       openings by custody; SHED by cause; the §2 equality
```

**The acceptance suite holds these on every refactor step**, as the sibling suites hold theirs:

- the public door writes an Arrival, Documents and their versions, and nothing else: no module
  under the intake route imports an evidence, mention, gap or thesis writer — a source scan
- the walk touches no document: no module under the walk imports a document reader or writer
- the registry's `submit` has ONE caller, the anchoring module, and the module has exactly two
  callers — the walk on ACQUIRED and the receipt or its standing pass — a source scan, and a test
  that breaks it with a third
- no research act reaches the chain: evidence A7's scan, unchanged, with add_document's
  commitment reaching the module and never `submit`
- nothing deletes a Document, Arrival, version or decision row: no `delete` on those tables
  outside the rebuild's cleanup; SHED nulls columns and releases a pin, and a test asserts the
  row count before and after are equal
- a citation pins only `affirmed`: evidence A7's test, run over a document
