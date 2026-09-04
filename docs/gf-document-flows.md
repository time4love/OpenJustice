# Document flows — the public · researcher · MCP · backend

**How a DOCUMENT arrives, is held, and becomes a record a thesis can cite, end to end.** The
corpus's flows are `docs/gf-interaction-flows.md`, evidence's are `docs/gf-evidence-flows.md`
and the thesis's are `docs/gf-thesis-flows.md`; this document begins at the door the thesis
flows left open — two appeals published with a thesis, and what comes back through them — and
adds nothing beneath any of the three. The reasoning is `docs/gf-architecture-target.md` §11
once these flows are signed off.

> **STATUS.** Being decided section by section with the researcher, 2026-09-03, on the evidence
> and thesis designs of the same day. This block is rewritten at sign-off to record what fell.
> ⚠️ marks what does not exist yet.
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

**The name shares one space with the corpus's names, and one equality in it is a fact, not a
collision.** A thesis cites `#ev_<name>` for a capture, a diff or a document alike (T2's kind
tells them apart). A document's name is the SHA-256 of bytes; a capture's `documentHash` is the
SHA-256 of a page's bytes as served. When a researcher holds the raw bytes of a blocked page and
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
                 the name is OPENED by publishing (name, salt) beside a citation — §7's act, the
                 researcher's, per document; a verifier hashes the pair and finds the entry
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
no other.

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
                         sender the name, the key and, after the receipt, the CID — ONCE, theirs to
                         keep · send ciphertext, key and name
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
             ← to the sender: received · each document's name and CID · the terms they
               accepted, verbatim. NOTHING a model said
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
              receivedAt, documents: [{ name, custody, verifiedAtReceipt | recomputable,
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
