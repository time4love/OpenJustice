# Thesis flows — researcher · MCP · backend · public page

**How a claim is FRAMED, WRITTEN, ARGUED, PUBLISHED and ANSWERED, end to end.** The corpus's own
flows are `docs/gf-interaction-flows.md` and evidence's are `docs/gf-evidence-flows.md`; this
document begins where that one ends — at a corpus record a thesis may cite by name — and adds
nothing beneath it. The reasoning is `docs/gf-architecture-target.md` §10 once these flows are
signed off.

> **STATUS.** The TARGET flows, decided section by section with the researcher on 2026-09-03,
> on the evidence design of the same day. What fell to the researcher's questions in this
> session, each a mechanism removed: designing the DOCUMENT class here (→ R12, §1) and any
> placeholder for it — a reserved citation kind, a refusal naming an undesigned class; "no
> model writes thesis text" (inverted: models write, the researcher decides, §2); the browser
> as an editor (the chat is the workflow; the browser is the public surface and a dialog that
> returns a command, §2); the key figure, its dossier, its hedging apparatus (T2, T5); the
> FOIA request as tracked state (a public appeal, never a researcher act, T4); the research
> session, its lock and its event log (§9); the version tree as a tree (a chain with a
> compare-and-set, T2); TipTap as the record, `TRACKED_URL`, `cite_trajectories`, the revision
> agents, the agenda's embedding search, `CALL_LIVE` as a gate; and anchoring the published
> version (T5: nothing above the corpus is anchored). One of this document's own
> recommendations was withdrawn under challenge — retiring the FOIA drafter — and one number
> was struck for carrying no decision. ⚠️ marks what does not exist yet. Nothing is left OPEN:
> what is out of scope and what is verified by measurement are named in §13, and the APPENDIX
> is the implementation contract, composed with the factual layer's A1–A8 and evidence's A1–A7
> and restating neither. Three of evidence's clauses are AMENDED here and named where they
> are: the mention's `role` (A2), `ThesisGapResolution`'s pin (A2), and PUBLIC_PAGE (A3).
>
> **SCOPE.** The thesis lifecycle: framing, versions, citations, the argument, gaps, publication,
> the public page, what follows publication, history and notes, and the thesis side of the
> return path. The DOCUMENT class is SCHEDULED as R12, not designed here — §1 says why. Bronze
> Fortress is untouched.

---

## 1. THE RETURN PATH, AND WHAT A THESIS IS

**The day ends at a door, and the door opens onto this document.** A researcher's day
(`docs/gf-researcher-day.md`) ends by producing the two things a court case is made of: FOIA
requests, each naming the record it rests on, and a whistleblower call, narrow on purpose. Both
come back as DOCUMENTS — an answer from the ministry, a submission from inside it — and a document
is the class the evidence design PARKED (evidence §10): a record with no corpus record beneath it,
which that design can neither name, version, verify nor review. The documents arrive through the
thesis, so the thesis flows cannot leave the class parked. They can design it or schedule it.

**Ruled 2026-09-03: SCHEDULED AS R12. What a document IS is discussed there, not here.** What
attests a document, what its content version is, and what publication opens for it are questions
of the shape of evidence §2, §3 and §5, and they are the same questions for the two other parked
classes — a page the archive does not hold, a live page that blocks fetching (flows, PARKED 1
and 2) — which arrive through acquisition and never through a thesis. They are R12's to ask as
well as to answer. Evidence §1 already rules that a record becomes evidence when a researcher
promotes it in light of a thesis, and that applies to a document unchanged; so the seam is in one
place, and it is the only thing this section fixes: **the request, the call and their answering
are THIS document's; the thing that arrives is R12's.**

**What this document decides about the return path, and where:**

- **The request and the call** (T4): a FOIA request is generated from a gap and names the record
  it rests on; a call is published with the thesis. Whether either is tracked as state — sent,
  due, answered — or generated as text is T4's question, brought there.
- **The answering** (T6): what the researcher does when an answer or a submission arrives, up to
  the point where the thing that arrived needs a name — which is R12's.
- **No placeholder for the class is built here** — no citation kind, no enum, no refusal naming a
  design that does not exist. The platform must work before every design is closed, and the
  rebuilt database holds no document (evidence §8), so nothing in these flows needs one. When R12
  lands, it adds its citation kind to T2 and its arrival to T6, and nothing else moves.

**Is the scenario real?** Designed for, and not yet met: no request has been sent under the
design, and the number of whistleblower submissions ever received is a measurement, read from
the table when it is needed. R12 is scheduled, not parked.

**WHAT A THESIS IS.** A thesis is a claim a researcher is trying to establish, written as text
with its citations inside the text — corpus records by name, trajectories by detection-pass id,
figures by name — and held as VERSIONS, each immutable, hashed over its content, and pinning
every citation to the content version it cited. The draft is a sequence of those versions,
written in discussion with the model — framed, criticised, revised — the newest being HEAD, the
one that debates read and the only one that may hold an unargued citation, until a version is
stable and grounded and the researcher approves it for publication. The PUBLISHED version is one
version, pinned: the public reads exactly it and nothing later, the platform never unpublishes
it, and what the platform has since learned about a citation is a flag derived on read, beside
it, never a change to it.

⚠️ As built, `EvidenceType.DOCUMENT` exists with identity over `contentHash`, the published thesis
cites one such record, and `create_evidence_from_text` and `recover_evidence_from_screenshot`
create the class; `generate_foia_request` returns text and records nothing. `ThesisVersion` is
immutable TipTap JSON with a `contentHash` and a parent tree; `ThesisMention` is an index
extracted from the text; `publishedVersionId` is the pin.

---

## 2. THE ACTORS

**Five are the flows documents' and keep their names** — the researcher, Claude, the browser, the
backend, and the model reached at Gate 5 and in the debate. Here the weight shifts: the chat is
the workflow, Claude drives it, and the browser is a public surface and an occasional dialog.
This document adds the reader of a public page and four model actors, each reached at one named
point, each paid, and none of which decides anything.

```
researcher   the human, and the JUDGE. Frames the claim; argues each citation in its debate;
             answers the devil's advocate's objections; adds what no model has — insight, the
             sense of what the case needs; guides the critic; approves every version before it
             exists; publishes. Every version, citation, promotion, request and publication is
             their act, attributed.
Claude       drives the workflow. Leads the discussion in which the thesis is written; calls the
             tools; holds the protocol — the order of the flows, the refusals, what readiness
             still lacks — and guides the researcher to a version that can be published. DRAFTS
             AND REFINES THE THESIS TEXT with the researcher, grounded in the records the tools
             return; saves a version only on the researcher's approval.
browser      two roles, and nothing between them. It is the PUBLIC READ-ONLY SURFACE — the
             reader's: the thesis page, the opened corpus pages. And when Claude opens a DIALOG
             in it, because the data is too complex for the chat, the dialog is an immutable
             transformation from an input to a user-driven output, returned to the chat as a
             copied NEXT-CHAT-COMMAND. It decides nothing and applies nothing.
backend      the services: versions, mentions, framings, notes, the gate, the public page's
             reads.
reader       the public, on the browser's first role: the thesis page, the opened pages of the
             corpus, the PUBLIC reads. No identity, and the output never depends on who asks
             (evidence A4).
```

**The dialog rule, stated once.** A browser dialog Claude opens — the marking page today, any
thesis-side surface a section names — takes an input, lets the researcher work it, and returns
its value as a command the researcher pastes into the chat. It may save state only as CACHE or
DRAFT, and only so that Claude can pick the transformation's value up, since Claude cannot
receive a return value from a page. That cache is never a decision, never a version, never
anything a flow reads as state; the act is the pasted command, executed through MCP and
attributed there. A dialog that wrote state a flow read would be the browser deciding.

**The model actors — each at ONE point, each PAID, each writing what it is told to and deciding
nothing:**

```
framing assessor       T1   assess_thesis_framing         reads the proposed framing against the
                            corpus; records an ASSESSMENT on the framing record: what it
                            contradicts, what it would frame instead. It quotes the researcher
                            verbatim, and T1 decides what happens when it cannot.
debate assessor        T3   open_debate · respond_in_debate   the evidence flows' actor, unchanged:
                            judges whether the researcher ARGUED for a citation — SUBSTANCE a hard
                            gate, MERIT advisory — never whether they are right (evidence §4).
devil's advocate       T4   run_ai_analysis               reads a version and what it cites; records
                            an OPINION on that version — counter-arguments and gaps — labelled AI
                            analysis (COMPLIANCE.md rule 3). Its role, and what the researcher
                            does with each objection, is T4's.
FOIA drafter           T4   generate_foia_request         writes the request in the statutory form,
                            from a gap and the record it rests on. The researcher reads it and
                            sends it under their own name; the platform sends nothing.
publication assessor   T5   check_publication_readiness   one check of the gate: does the rationale
                            ARGUE — the debate's question, asked of the whole. It never judges
                            truth; every other check is a predicate with no model in it
                            (evidence A6).
the critic             §10  does not exist                reads the CORPUS, never the evidence
                            table; writes nothing but its own record; the researcher guides it.
                            Built later; its role is §10's.
```

**Models write; the researcher decides. Ruled 2026-09-03.** The thesis text is written and
refined by a model with the researcher, because reading a corpus record against a claim and
turning it into coherent, evidence-grounded prose is the model's strongest capability and writing
it by hand is long work; the letter is written by a model in the form the law requires. What no
model does is DECIDE: nothing a model writes becomes a version, a citation, a promotion, a request
or a publication except by the researcher's act, after the researcher has read it. A version is
the researcher's statement whoever produced the words — they stand behind it, and the defamation
burden reads it that way. What carries the label "AI analysis" is the opinions: the assessments,
the critique, the verdicts. Whether grounded refinement is Claude alone in the chat or also a
backend tool Claude calls — fed each cited record's CURRENT content by the backend rather than by
whatever the chat holds — is T2's question, and the prosecutor plan's "a thesis is written by a
human" is re-read there and at §10 in this light. What T2 also answers is the one thing the
as-built revision agents did that no design keeps: text that became a version body under an
instruction to yield, which the researcher never read (prosecutor plan §7).

**The two authorities of the flows documents gain a third line.** The walk writes the corpus and
never a thesis; research acts write theses, mentions, decisions and requests and never a version
of the corpus; **model actors write text and opinions for a researcher to read, and no state** —
no version, no mention, no status, no publication, no chain entry.

**Every paid point is a call the researcher makes, through Claude, by name.** Framing, the
debate, the analysis, the letter and the rationale check; none runs on a read, on a save or on
publication by itself. The critic will be one more.

⚠️ As built, `get_research_agenda` — named as a read — invokes `GapRevisionAgent` behind a flag,
one paid call per open gap, and returns a body to pass straight to `add_thesis_version`;
`RevisionAgent` rewrites the body under `THESIS_REVISION_PROMPT`'s instruction to soften;
`thesisRoutes` reaches both, `FoiaLetterAgent` and the devil's advocate from the browser, so the
UI does research work the prosecutor plan §10 rules is MCP-only; the version body is TipTap JSON,
an editor's format with no editor in these flows. `ThesisValidatorAgent` has no caller;
`LegalMasterAgent` and `TrustAgent` serve the chat and argument routes, outside these flows. The
debate's assessor is `ForensicPromotionAssessorAgent`, which `ThesisPublicationAssessorAgent`
composes with. The framing assessor's three defects are recorded in
`docs/gf-framing-assessor-defects.md` and answered in T1. `get_whistleblower_call` invokes no
model: it derives the call from the stored analysis.

---

## 3. FLOW T1 — FRAMING: THE GLASSES, THEN THE CLAIM

**The compass.** This platform exists to establish whether the state and the Ministry of Health
violated the Nuremberg Code during the Covid years — its first principle before any other: a
person cannot consent to a medical intervention while the state withholds or alters what it
knows about the risks — and, where the Code does not reach, Israel's criminal law, its human
rights obligations and its Basic Laws. Those provisions are the GLASSES through which the corpus
is read: a provision says what kind of record demonstrates a violation, so it says what to look
for before anything is found. `docs/gf-prosecutor-dev-plan.md` §3–§6 already rule how: the Code
applies at THESIS level, never as a tag on a record; a violation is a relationship between records
over an interval; one article per thesis, stored on the thesis, optional; the Code enters as
STRUCTURE — a test on a cluster and a retrieval specification on the corpus — never as a lens
that flatters whatever it is pointed at; and the duty holder is the office. Framing is where a
researcher puts the glasses on.

**The shape of a violation is two timelines and the gap between them.** What the public was TOLD,
capture by capture — the trajectories of the public pages. What the ministry KNEW, and when —
grounded first in what it officially published: circulars, protocols, committee publications,
pages the walk holds like any other; and second in documents that arrive through the return path
(§1, R12). A duty holder, which is the office. And the DIVERGENCE between the two timelines over
an interval computed from captures, never from a stored date pair. The comparison is what can
establish a criminal charge; how strong the charge is depends on how well the thesis answers the
devil's advocate's objections — from the corpus, from a FOIA answer, from a whistleblower's
document (T4, T5). Framing does not make the charge strong. It makes it the RIGHT charge, with
its elements named, and it names which element has no record behind it yet — the first gaps,
before any version exists.

**What framing reads is the CORPUS, computed.** Evidence does not exist yet — a thesis may exist
before its evidence, and framing is what exists for that (evidence §1) — so the assessor is
handed corpus records the researcher has been reading, by name, and each one's CURRENT computed
content: a capture's text, a diff's chunks, a trajectory's history. Never a summary, never a
classifier's opinion, never a row retrieved by an embedding. One register, the computed one; the
as-built rule "in a conflict the trajectory beats the summary" has nothing left to rank and goes.

```
researcher   "I want to establish that …" — the QUESTION, in the chat; and the glasses: which
             provision, or none yet
Claude       → open_framing(question, provision?)                           ⚠️ renamed
backend      creates the FRAMING record — no status, no lock, nothing to close (§9);
             thesisId null until T2 attaches one
             ← { framingId, question, provision, elements: the provision's required record
                 shapes (prosecutor plan §5), each UNFILLED }
researcher   reads the corpus with Claude — list_findings, get_claim_trajectories,
             verify_claim_text, on the public pages AND the ministry's own published record —
             and proposes a FRAMING: the sentence the thesis would argue, and for each element
             of the provision, the records that supply it, or MISSING
Claude       → assess_framing(framingId, proposedFraming, elements, records[], trajectoryIds[])
backend      REFUSES NO_RECORDS · NOT_ACQUIRED · AWAITING_DERIVATION · NOT_YOURS
             loads CURRENT content per record, each trajectory, and the prior rounds
             records FRAMING_PROPOSED — the researcher's words and element map, verbatim
             → ASSESSOR: the provision's TEST — which record supplies each element, and which
               element has none (it fails legibly; nothing is written around) · candidate
               framings, each anchored in a named record · contradictions, each quoting the
               researcher and naming the record and phrase that contradicts · unverified
               assumptions, each with how to check it · a recommended framing · its reasoning
                                                                                    paid, once
             AUDITS the assessment before recording it, mechanically, no model:
               researcherClaim   a whitespace-collapsed substring of the proposal?
                                 → quoteVerified: true | false
               whatEvidenceShows the phrase it attributes to the record, checked against that
                                 record's CURRENT content by the ONE verdict rule
                                 (audit_thesis_claims' — never a second spelling)
                                 → phraseVerified: PRESENT | ABSENT
               each element      the record it names is one the researcher supplied, and it
                                 is ACQUIRED — an element "filled" by a record nobody holds
                                 is UNFILLED
             records FRAMING_ASSESSED with every verdict beside its assertion
             ← the assessment, each assertion labelled; the elements, filled or not; the round
researcher   answers, revises, proposes again — as many rounds as it takes — or stops
Claude       → choose_framing(framingId, provision?, claim, elements)         ⚠️ to build
backend      REFUSES NOT_ASSESSED (no round in this framing) · NOT_YOURS
             records FRAMING_CHOSEN, attributed — the researcher's words, whether their own,
             the assessor's, or a third; the provision; the element map, MISSING included
             ← { framingId, provision, claim, elements }

STATE        the framing and its rounds; nothing on any thesis until T2 creates one, or
             attaches to one (below)
```

**A MISSING element is a framing's honest output, not its failure.** The plan's acceptance test
(prosecutor plan §8) is the case: three of four Article 1 elements bound in prose, the duty
holder absent, and one datum — the date of a presentation to the ministry — that would close the
stronger claim, which the drafting conceded away instead of naming. Under this flow that element
is recorded MISSING at framing, and T4 turns a missing element into what it is: a FOIA target,
a whistleblower gap, or a corpus search not yet run. A thesis is opened with its gaps on record
from its first day.

**Where the Prosecutor enters, and where it does not yet.** Today the researcher reads the
corpus and proposes the cluster; the critic of §10, when it exists, proposes clusters that have
a provision's SHAPE — which records, in which order, in which window — and framing is where a
researcher judges its proposal, exactly as it judges their own. The Prosecutor feeds framing; it
never frames. Nothing here waits for it.

**A contradiction that misquotes the researcher is shown, labelled, and never dropped. Ruled
2026-09-03.** Four framing runs on two corpora produced the same three errors — a dropped
conjunct, an inserted cause, a stock phrase attributed to a page that never said it
(`docs/gf-framing-assessor-defects.md`) — and reproducibility is the signature of a prior, not
of noise. The substring check makes the misquotation visible; what happens then is the decision.
Dropping the contradiction suppresses a disagreement that may be real; retrying spends a call on
a prior that will reproduce; keeping it with `quoteVerified: false` tells the researcher *the
machine paraphrased you here* and suppresses nothing. Nothing gates on a framing contradiction,
so the flag is free. The same holds for `phraseVerified: ABSENT`: the assessor's assertion stands
on the record with the archive's answer beside it, exactly as the researcher's prose is audited
in T5 — **both parties to the framing round are audited by the same rule**, and the one whose
assertions went unverified was the one the researcher was told to defer to.

**The researcher's numbers are on the record too.** A round that asserts a count — "five patterns
removed and restored" where the trajectory computation holds seven — is recorded verbatim as
FRAMING_PROPOSED, beside the computed trajectories the assessor was handed; the disagreement is
readable from the framing by anyone. It is not refused and not corrected: framing is an
argument, and the corpus is in the room.

**The choice is the researcher's, and it is recorded.** The assessor recommends; it may recommend
its own framing over the researcher's and say why; the researcher chooses, in their own words,
and the choice is the CLAIM the thesis carries and the PROVISION it asserts (T2 says where; the
plan already places the provision on the thesis). A framing with rounds and no choice is a
discussion that ended without a decision — a legitimate record, and no thesis.

**Framing attaches to a claim, before or after a thesis exists. Ruled 2026-09-03.** A thesis
opened because of a diff seen during a walk exists unframed (evidence §1); its author frames it
afterwards, in a framing on that thesis, while it is unpublished. A framing with no thesis
attaches to the thesis T2 creates from it. **Re-framing is a new framing on the same
thesis**, with the old one kept; a different provision is a different thesis (prosecutor plan
§4). What T5 asks is not "is a framing attached" but whether the head version's claim is one the
researcher CHOSE after an assessed round:

```
CLAIM_FRAMED(v)   ∃ framing f attached to v.thesis with a FRAMING_CHOSEN round whose claim is
                  v.claim and whose provision is v.thesis.provision, preceded in f by at least
                  one FRAMING_ASSESSED
```

A claim reworded after its framing is a claim that has not been framed, and the predicate says
so by construction — the researcher frames again, or chooses again in the same framing after a
new round. Whether the check is hard is T5's; the predicate is this flow's.

**A note before a thesis exists lands on the framing.** `add_note` takes a thesis or a framing:
a note is attached to the thing it is about, and there is no session to hold it (§9). The
seven-versus-five correction found mid-framing on 2026-08-27 had nowhere to go; under this rule
it is one note on the framing it belongs to.

**Paid: one assessor call per round, on the researcher's proposal, never on a read.** Rounds are
not bounded by a number; the researcher stops.

⚠️ As built, `assess_thesis_framing` retrieves CONFIRMED evidence by an embedding of the question
over the vault's summaries, refuses `NO_EVIDENCE` when none matches, hands the assessor
summaries plus trajectories with a prompt ranking one above the other, knows no provision and no
elements, and refuses `ALREADY_HAS_THESIS`; `researcherClaim` and `whatEvidenceShows` are free
text and nothing checks either; `recommendedTopicString` is described as "what gets fed to
evidence retrieval" and no researcher's choice is recorded anywhere — the thesis attaches to
"the single ACTIVE session with no thesis", derived, and `repairFramingLink` exists because the
derivation failed on production; `Thesis` has no provision column; check 13 `FRAMING_ATTACHED`
is advisory and asks only whether a session is linked; `add_session_note` requires a `thesisId`.

---

## 4. FLOW T2 — WRITING AND CITING: THE VERSION WRITE

**A version is one transaction, and the citation is inside the text.** The researcher and Claude
write the text in the chat (§2); when the researcher approves it, ONE tool writes ONE version:
the text, its hash, the mentions extracted from it, each mention's pin computed at that moment,
and the head pointer moved — all or nothing. Nothing else creates a version. The text is what
the researcher approved, in Markdown, with each citation an inline token naming what it cites;
the hash is over those bytes; how it renders is the reader's surface (§2), not the record.

**Two things a version cites, and each by its own name:**

```
#ev_<fileHash>     a CORPUS RECORD — a capture or a diff — by the name evidence A1 derives from
                   the record itself, whether or not any evidence row exists yet (evidence §4).
                   list_findings returns the name of every record on a page's timeline, promoted
                   or not, so a draft can cite what the corpus holds before anyone has argued for
                   it. The mention pins a CONTENT VERSION (below) and references its argument.
#tr_<id>           a CLAIM TRAJECTORY — Level 6's, cited by its detection-pass id, never by a
                   claimHash: the id pins the pass, so "removed and never restored" stays what
                   was cited when a later pass finds the claim back. TRAJECTORIES_CURRENT is its
                   currency check, unchanged (evidence §10).
```

**`TRACKED_URL` and `KEY_FIGURE` are RETIRED. Ruled 2026-09-03.** A page is reached through the
records a thesis cites on it; publication opens the PAGE because a record of it is cited
(evidence §5), and a thesis that cites no record of a page has nothing to say about it. The
element "the page the duty was owed on" (prosecutor plan §4.1) is the page of the cited records
and the trajectory, derived. **A key figure adds nothing to a charge**: the duty holder is the
office (prosecutor plan §6), a violation is two timelines and a gap, and a person has no content
version to pin. What a figure was for — a public page aggregating every record and thesis about
a named individual — is the surface COMPLIANCE.md names as the reputational-attack risk, and its
only source was a model's `figures` output on the evidence row, which the evidence design
removed. The one real use survives as something else: an index from a person's name to the
corpus records that mention them, computed over text versions, INTERNAL, for the Prosecutor
searching the corpus — §10's, built with it, never user-facing. How a published text may name a
person is T5's, and it is answered there without a figure table.

```
researcher   approves the text in the chat: "…as the ministry's page said on <date> #ev_… and
             never restored #tr_…"
Claude       → add_thesis_version(thesisId, text, claim, expectedHeadVersionId)   ⚠️ re-shaped
             or, for the first version:
             → create_thesis(claim, provision?, text, framingId?)                 ⚠️ re-shaped
backend      REFUSES NO_RESEARCHER · NOT_AUTHOR (the thesis is another researcher's, §9) · STALE_HEAD
             (expectedHeadVersionId ≠ head — someone wrote first; read and write again) ·
             PUBLISHED_HEAD? never: the head is always a draft, and a published version is
             pinned beside it (T5)
             parses the text: every token becomes a mention, deduplicated per (kind, name)
             for each #ev_ mention, computes the PIN:
               an Evidence row exists   → pin := its affirmedContentVersionHash — the ONLY
                                          value allowed (evidence A2); the record's CURRENT
                                          may differ, and that is Flow E3's, not this write's
               no Evidence row yet      → pin := CURRENT(record).hash — what the author read
               REFUSES NOT_A_RECORD (the name resolves to nothing the corpus holds) ·
                       AWAITING_DERIVATION (naming the diff) · NOT_ACQUIRED
             for each #ev_ mention, carries the ARGUMENT forward:
               the parent version has the same (fileHash, pin) with a debateSessionId → copied
               the pin changed, or the citation is new                             → none;
                                          the mention is unargued until T3 argues it
             for each #tr_ mention: REFUSES UNKNOWN_TRAJECTORY_ID
             ONE transaction: the version (text, contentHash = sha256(text), claim,
               parentVersionId = head) · its mentions · thesis.headVersionId := the version
             ← { thesisId, versionId, contentHash, mentions: [{ kind, name, pin, argued }],
                 unargued: the #ev_ mentions with no argument — T3's work-list }

STATE        one version row, its mention rows, the head pointer · nothing on any evidence
             row, any corpus record, any chain — the version is its own record of the act
```

**The pin is computed by the write, never supplied.** The text names the record; the write
records which content version the author was looking at, and it may only be the affirmed one
where a human has affirmed one. A researcher whose citation refuses `STALE_PIN` — the record
moved, its `affirmed` moved by a REAFFIRM, and the parent version pinned the old one — is not
asked to type a hash: the write re-pins to `affirmed` and reports that the argument for that
mention did not carry, because the argument was made against a version this citation no longer
names (evidence A6, `EVIDENCE_ARGUED`). Re-arguing is T3's, and it is the price of a moved
record, paid once per citing thesis and stated here so nobody pays it by surprise.

**The head is always a draft, and a draft may hold what a published version may not.** Unargued
citations, a record not yet promoted, a citation whose record was withdrawn — all legal in the
head, all refused by PUBLISHABLE (T5). The write refuses only what makes the version itself
malformed: a name that resolves to nothing, a pin that cannot be computed, a stale head.

**The version chain is the history, and it never branches. Ruled 2026-09-03.** `parentVersionId`
records what a version was written against, and it is always the head at the moment of the
write — the compare-and-set makes that a guarantee rather than an observation. What the chain
is for: gap resolutions carry forward from the parent (T4); the public page shows what changed
between the published version and the one that answered a flag (T6); and the audit reads, in
order, what a researcher stood behind and when. Nothing forks, nothing merges, nothing is
rebased: a version that disagrees with the head is a new version after it.

**The claim is on the version; the provision is on the thesis; `title` goes.** The claim is the
sentence the thesis argues — chosen in framing (T1), restated verbatim in each version's `claim`
so that CLAIM_FRAMED can compare — and it is the thesis's heading everywhere it is shown. The
provision is one per thesis, stored on the thesis, optional, as the prosecutor plan rules; a
different provision is a different thesis.

**No role on the mention.** Evidence A2 left the researcher an optional `role`; the prosecutor
plan §4.1 rejected the column because a role is meaningful only relative to a provision the
column would not record. Under T1 the element a record fills is in the framing's element map,
and what the record does for this thesis is the argument (T3). Evidence A2 is amended by this
document (docs that move).

**Retired, and what each was:**

```
cite_trajectories       a second writer of versions, splicing tokens into the head's prose;
                        Claude places the token, and one tool writes the version
/mentions/evidence      the editor's autocomplete over evidence rows and their summaries; there
                        is no editor, and list_findings names every record
TipTap JSON as content  an editor's format stored as the record; the content is the text
TRACKED_URL             a citation of nothing a version pins
KEY_FIGURE · KeyFigure · get_figure_dossier · /figures · /key-figures
                        a per-person public aggregation with no source and no need; the
                        Prosecutor's name index is internal and §10's
ThesisVersionStatus     PENDING_AI | COMPLETE tracked whether an opinion existed; whether the
                        analysis exists and is current is derived (T4)
```

⚠️ As built, `add_thesis_version` and `create_thesis_draft` take a Markdown body and build TipTap
JSON with mention chips in a trailing paragraph or at `[^n]` footnotes; `parseMentions` extracts
the index from the JSON; `contentHash` is over the JSON; `parentVersionId` is set to the head
with no compare-and-set; the mention holds `type` and `refId` and nothing else; `cite_trajectories`
and `POST /api/thesis/:id/versions` are two more version writers; `KeyFigure` rows are created
by intake from a model's `figures` output on the evidence row; `Thesis` has `title` and no
provision, `ThesisVersion` has no claim; no write checks that the researcher holds a session on
the thesis.

---

## 5. FLOW T3 — THE ARGUMENT: WHAT THE THESIS SIDE ADDS TO FLOW E1

**The argument is evidence Flow E1, and this section restates none of it.** A debate opens on a
citation of the head version, one per (thesis, record); the assessor judges SUBSTANCE — did the
researcher make specific, falsifiable claims about the record's CURRENT computed content — as a
hard gate and MERIT as advisory; a sustained objection is answered at least once or carried on
the record forever; promotion creates the evidence row on the first cleared argument and joins
it on every later one; nothing is written to any chain. Every refusal is evidence A4's. What the
thesis side adds is three things: the passage, the work-list, and the mention's argument.

**The passage is handed to the assessor.** The debate's question is "does this record support
what thesis T says it does?", and "what T says" is a sentence, not a thesis: the paragraph in
which the token appears, extracted from the head version's text by the backend, is the
assessor's material beside the rationale and the record's computed content — its chunks, or its
text. Nothing else: no classifier reasoning, no categories, no significance. The assessor reads
a claim, a record, and an argument connecting them, and answers whether the argument can be
checked.

```
backend      after any version write: ← unargued: the #ev_ mentions with no argument (T2)
researcher   with Claude, writes the rationale for one citation: what the record shows, why it
             carries the passage, what would prove it wrong — the researcher's argument once
             they approve it, whoever drafted it (§2)
Claude       → open_debate(thesisId, record, rationale)                        evidence A4
backend      REFUSES NOT_CITED unless the HEAD version mentions the record — the citation comes
             first (evidence §4); every other refusal as A4
             hands the ASSESSOR: the rationale · the record's CURRENT computed content · THE
             PASSAGE — the paragraph of the head version that cites it · the prior rounds
             ← the debate state; SUBSTANCE cleared or its gaps; MERIT and the objection if any
researcher   answers an objection, or supplies what the gaps asked for — or not
Claude       → respond_in_debate(sessionId, response)          as many rounds as it takes
Claude       → promote_from_debate(sessionId)
backend      REFUSES as A4, re-checked now · and STALE_PIN: the head's mention pins a version
             that is not the record's CURRENT — the argument was made against content the
             citation does not name; write a new version (it re-pins) and promote again
             ONE transaction, A4's, plus one write of this document's:
               the head version's mention for this record gains debateSessionId := this debate
             ← A4's return · the mention now ARGUED
researcher   the next unargued mention; or, none left — readiness (T5)
```

**The work-list is the version's, not a debate's.** What a researcher owes on a draft is its
unargued citations, and the version write names them (T2). Open debates are not owed anything:
a debate is reached through the mention that cites its record, so a debate whose citation left
the text is dormant by derivation — no status, no tool, nothing to close — and if a later
version cites the record again, `open_debate` returns it, as A4 rules for an OPEN pair.

**The argument travels with the citation, and only with it.** A later version that cites the
same record at the same pin copies `debateSessionId` (T2). A version that re-pins — after a
REAFFIRM moved `affirmed` — carries no argument for that mention: the argument was made against
a version this citation no longer names, and `EVIDENCE_ARGUED` (evidence A6) would fail it. The
researcher argues again, in a new debate on the same pair; the old debate stays PROMOTED, its
evidence row stays, and `promote_from_debate` joins the row rather than creating it. One
argument per (thesis, record, content version) — the price of a moved record, T2's, paid here.

**A second thesis citing the same record argues its own.** The record is promoted already; its
row is joined, not created; the argument, the objection and `promotedOverObjection` are this
thesis's and sit on this thesis's mention. Nothing about the first thesis's argument is
inherited, and nothing about the second's changes the first.

**What a reader may see of the argument is T5's.** The debate is a GATED read (evidence A4);
whether the public page says that a citation was argued, and whether it was promoted over the
assessor's objection, is decided with the public page.

**Paid: one assessor call per round, on the researcher's argument, never on a read.**

⚠️ As built, `open_diff_debate` takes a diff and no thesis, refuses `ALREADY_EVIDENCE`, and hands
the assessor the diff's URL, two date strings, the classifier's reasoning and categories, the
deleted and added items and the rationale — a model's opinion beside computed content, and no
passage, because the debate has no thesis to take one from. `promote_from_diff_debate`
registers on chain and writes CONFIRMED or PENDING_REVIEW. The mention holds no
`debateSessionId`. `DiffDebateStatus.ABANDONED` exists and nothing writes it.

---

## 6. FLOW T4 — ANALYSIS AND GAPS: WHAT THE CORPUS CANNOT SAY

**The honest part of the day.** The corpus shows what a page said and when it changed. It cannot
show who decided, what they knew, or what the reporting numbers were — and a court case is made
of exactly those. Two things find the gaps: framing, which records each element of the provision
with no record behind it (T1), and the devil's advocate, which reads a version and says what a
hostile reader would say. What the researcher does with each gap is one of the prosecutor plan
§7's three outputs — the corpus answers it, a document would answer it, or the researcher
concedes — and the platform records which, so that "quietly hedge" is not a thing a thesis can
do without its author seeing it. A published thesis then ends in TWO APPEALS, both derived from
those decisions and both the public's to act on: a call to the people who saw the document, and
a request any citizen can send for it.

### The critic: an opinion on a version

```
researcher   "what would a hostile reader say?"
Claude       → run_analysis(thesisId)                                      ⚠️ re-shaped
backend      REFUSES NO_HEAD · NOT_AUTHOR · AWAITING_DERIVATION (naming the diff) ·
             ANALYSIS_CURRENT (an analysis for this exact input already exists — nothing is
             spent twice on the same question)
             computes the INPUT FINGERPRINT: sha256 over the version's contentHash · each cited
               record's CURRENT contentVersionHash · each cited trajectory id · the gap
               decisions in force (below) · the prompt version
             hands the CRITIC: the text · each cited record's CURRENT computed content ·
               each trajectory · the gap list with its decisions — never a summary
             → CRITIC: counter-arguments, each quoting the sentence it challenges and grounded
               in a cited record or a stated absence · suggested gaps, each naming the document
               that would close it and who would hold it · alternative readings that need no
               intent · an overall strength, labelled as the critic's                paid, once
             AUDITS it, mechanically, before recording (T1's rule for every model actor):
               each counter-argument's quoted sentence   a substring of the text? → quoteVerified
               each assertion about a record            checked by the ONE verdict rule
                                                         → phraseVerified: PRESENT | ABSENT
             appends ONE ThesisAnalysis row: versionId · inputFingerprint · the opinion, with
               every verdict beside its assertion · model · promptVersion · runAt
             ← the analysis, labelled AI analysis; the suggested gaps as candidates, not gaps

CURRENT_ANALYSIS(v)   the newest ThesisAnalysis of v whose inputFingerprint = FINGERPRINT(v)
                      — none: the version is unanalysed, or its analysis is stale; T5 says so
                      by name and never runs one
```

**The analysis is an opinion and it is stored as one.** It sits beside the version in its own
row, never on it — the version is immutable and its hash is over the text — and the fingerprint
says exactly what the opinion was about: a cited record whose content moved, a re-pinned
citation, a changed decision, a newer prompt, each makes the analysis STALE by derivation. Nothing
re-runs on its own: a stale analysis is reported, and the researcher spends the call or does
not. The critic's strength grade is shown as the critic's and gates nothing.

### The gap list: the researcher's, with one decision per gap

```
gap             something the thesis needs and the corpus lacks; identity = sha256 of its
                whitespace-collapsed description, so a re-run that raises the same gap finds
                its decision and a re-worded one is new
enters from     T1: an element recorded MISSING at framing — the researcher's, already on the
                list at OPEN · the critic: a suggested gap the researcher ACCEPTS (below)

Claude       → decide_gap(thesisId, gap, decision, …)                        ⚠️ the new tool
backend      REFUSES NO_HEAD · NOT_AUTHOR · REASON_REQUIRED (on DISMISSED, CONCEDED)
             · NOT_CITED (CITED names a record the head version does not mention)
             appends ONE ThesisGapDecision: versionId · gapId · description · sequence · decision
             · researcherId · at; the decision in force for a gap is its latest

OPEN         accepted, not yet answered — the critic's suggestion becomes the thesis's gap
CITED        the corpus answers it: names the record; the head version cites that record, and
             the pin is the mention's (T2) — the decision points at the citation, never at a
             second pin
REQUESTED    a document would answer it and a public authority holds it: the gap becomes a
             FOIA REQUEST the public can send (below), with the request text the researcher
             approved
CALLED       a person would answer it: the gap becomes an item of the call (below), with the
             call text the researcher approved
CONCEDED     the thesis will say so, explicitly, in its text; reason required
DISMISSED    the suggestion is wrong or irrelevant; reason required; the critic is handed it
             and does not raise it again as new

carries       decisions carry forward along the version chain (T2) while the gap is on the list;
              a gap CITED whose citation leaves a later version's text is OPEN again, derived
```

**The gap list is the research agenda, and it is a read of decisions.** `get_research_agenda` —
open gaps against embedding hits, plus a paid rewrite per gap — is RETIRED; what the thesis
still needs is the list of gaps not CITED, CONCEDED or DISMISSED, with each REQUESTED gap's
request and each CALLED gap's call item, served on the thesis read (§9, A4) with no model and
no search. A corpus search for a gap is the researcher's, with Claude, on the corpus reads.

### The FOIA request: the second appeal, drafted by a model and sent by the public

**A request is not a researcher act and creates no state. Ruled 2026-09-03.** The platform
cannot know that a letter was sent, and a SENT it could not verify would be a public claim on
one person's word — the class of state this design keeps nowhere. Freedom of information is a
public action: the law lets any citizen ask, and many citizens asking is the engagement the
platform exists to drive. So a REQUESTED gap is PUBLISHED as a request ready to send, in the
call's exact shape, and what happens after is the public's.

```
Claude       → draft_foia_request(thesisId, gapId)                          ⚠️ re-shaped
backend      REFUSES NO_HEAD · NOT_AUTHOR · NO_SUCH_GAP
             hands the DRAFTER: the gap · the claim · the records the gap rests on — the head
               version's citations whose passages the gap concerns, by name, with their
               computed content — so the request carries the proof that the change happened
             → DRAFTER: the letter in the statutory form · the authority addressed · the
               legal basis · the addresses                                        paid, once
             ← the draft; nothing is written
researcher   reads it, amends it with Claude, approves it
Claude       → decide_gap(thesisId, gap, REQUESTED, requestText, authority, legalBasis, …)
backend      the decision carries the request; that is the whole record
```

**The public page publishes each request beside its gap** — what to ask for, of whom, on what
legal basis, at which address, resting on which records — with one instruction: send it under
your own name, and if you receive an answer, submit it here. The platform sends nothing and
records no sending. An answer arrives through the public's intake channel, exactly as a
submission does, and is R12's record (§1, T6); when it has a name the gap moves to CITED. The
researcher may send the request too, as a citizen, and may note it on the thesis (§9); that
note is theirs, not the thesis's.

### The call: narrow on purpose, and the researcher's words

The call is derived from the published version's CALLED gaps and nothing else: for each, what
is needed — the document, the instruction, the minutes — who would have seen it, in which unit,
in which window, and how to reach the platform, which is the public's intake channel and stays
the public's (§1). The text of each item is written in the chat and approved with the CALLED
decision; no model writes the call at read time, and `get_whistleblower_call` is a PUBLIC read
with no model in it. **A call names units and roles, never a person** (T2). A thesis with no
CALLED gap has no call, and that is a legitimate published thesis: `CALL_LIVE` is RETIRED as a
gate, and readiness reports the call's item count as information.

**A submission that answers a call is the return path (§1, T6, R12).** It arrives through the
public's channel under the submission terms COMPLIANCE.md requires, and it is intake until a
researcher promotes it in light of the thesis; nothing here changes when it arrives except
that the researcher is told.

**Answering the critic is done in the text, and the text is what the next run reads.** A
counter-argument is answered by a citation the corpus supplies, by a request for the document
that would supply it — which is a gap, REQUESTED — or by an explicit concession in the text.
"Soften the claim" is not one of the three, and the agent that did it is retired (§2). Claude
holds that protocol in the chat; the researcher reads every version before it exists; the next
analysis judges what was written. No per-objection state is kept: an objection is the critic's
opinion on one version, and the version that answers it is the record.

**Paid: one critic call per distinct input, one drafter call per draft — both on the
researcher's word, never on a read.**

⚠️ As built, `run_ai_analysis` hands the critic the cited rows' `summary` fields with a caveat
that summaries are a model's, writes the result onto the version with `status: COMPLETE`, and
`ANALYSIS_CURRENT` compares a fingerprint over messages; gaps are `aiAnalysis.evidenceGaps[i]`,
addressed by index, so a re-run renumbers them; `ThesisGapResolution` resolves a gap by an
evidence hash from the UI, upserted on the head; `get_research_agenda` searches the vector store
per gap and, behind a flag, has a model rewrite the thesis; `generate_foia_request` hands the
drafter the thesis title and the gap's two strings — no record — and records nothing;
`get_whistleblower_call` derives the call from every critic gap not yet resolved, and `CALL_LIVE`
(check 9) fails a thesis with no gaps; `GAP_ACTIONABILITY` (check 12) is the publication
assessor's opinion that each gap names a document and a holder; a whistleblower's files arrive
through `POST /api/thesis/:id/gaps/:gapIndex/whistleblower` and become `PENDING_REVIEW` DOCUMENT
evidence at once.

---

## 7. FLOW T5 — PUBLICATION: READINESS, THE ACT, THE PAGE

**Publication is the platform's public commitment, and it is the one act that makes things
public it did not make public before: the version, the pages it cites, the appeals it makes.**
Readiness is a list of checks, each a predicate with one implementation or a labelled opinion,
each naming what it examined; the act pins the head as the published version; and the page
shows the reader the claim, its citations resolved to the corpus, what the platform has since
learned about each, and what the reader can do.

### Readiness

**The six evidence checks are evidence A6's and are not restated**: `EVIDENCE_VERIFIED`,
`EVIDENCE_PINNED_CURRENT`, `EVIDENCE_ARGUED`, `EVIDENCE_NOT_WITHDRAWN`, `EVIDENCE_DERIVED`,
`EVIDENCE_DIFF_INPUT_SOUND` — PUBLISHABLE(m) for every EVIDENCE mention, each calling A3's
predicate. This document adds its own, and every one below is either mechanical or an opinion
that says so:

| check | kind | what it asks |
|---|---|---|
| `HEAD_VERSION` | hard | a version exists and is not the published one — publishing the published version is NOTHING_NEW |
| `CLAIM_FRAMED` | hard | CLAIM_FRAMED(head) (T1): the claim was chosen after an assessed round, under this provision |
| `CITES_EVIDENCE` | hard | at least one EVIDENCE mention — a thesis with none argues from nothing the corpus holds |
| `TRAJECTORIES_RESOLVE` | hard | every cited trajectory id resolves to a stored detection pass |
| `TRAJECTORIES_CURRENT` | hard | no cited trajectory is contradicted by the newest pass; a stale one is re-pinned by a new version, as evidence is |
| `ANALYSIS_CURRENT` | hard | CURRENT_ANALYSIS(head) exists (T4): the text being published is the text that was criticised; a stale analysis is named, never run |
| `GAPS_DECIDED` | hard | no gap on the list is OPEN — every one is CITED, REQUESTED, CALLED, CONCEDED or DISMISSED (T4); mechanical, replacing the assessor's actionability opinion |
| `RATIONALE_SUBSTANCE` | hard | the publication assessor: did the rationale ARGUE — the debate's question of the whole; MERIT is advisory and recorded |
| `PUBLIC_INTEREST_STATEMENT` | hard | present on the thesis (COMPLIANCE.md rule 5) |
| `NAMES_NO_PERSON` | hard | the assessor lists every personal name in the text; the list is empty. A published version names offices, units and roles (T2); the corpus records beneath it carry the names as the pages said them |
| `ALLEGATIONS_FRAMED` | advisory | the assessor's opinion that claims are framed as allegations under investigation (COMPLIANCE.md rule 1); recorded with the publication |

**Every check names what it examined, and an empty scope says so.** `NAMES_NO_PERSON` reports the
names it found; an assessor that finds none has passed a version, and whether it would find a
name that is there is a recall the measurement section owns — the check is honest about being an
enumeration under a property. `FIGURES_HEDGED`, `OFFICIAL_CAPACITY`, `EVIDENCE_TIER`,
`CALL_LIVE`, `GAP_ACTIONABILITY`, `ANALYSIS_COMPLETE`, `ANALYSIS_WELL_FORMED` and
`FRAMING_ATTACHED` are RETIRED — each is replaced above or has no subject left.

`audit_thesis_claims` is unchanged and reports only: dates, quotations and intervals against
the archive, no model, with what it could not check named. Claude runs it before readiness and
puts its findings in front of the researcher; it gates nothing, because a mechanical check with
a declared blind spot must not read as a verdict.

### The act

```
researcher   "publish", with the rationale — the argued case for publishing THIS version —
             and the public-interest statement, both written with Claude and approved
Claude       → check_publication_readiness(thesisId, rationale?)          writes nothing
             → publish_thesis(thesisId, rationale, publicInterestStatement)
backend      REFUSES NOT_AUTHOR · REASON_REQUIRED · NOTHING_NEW · NOT_PUBLISHABLE with every
             hard failure named, each with the mention or gap it examined
             → ASSESSOR: the rationale against the version                        paid, once
             records the rationale and the assessment as a PUBLICATION ATTEMPT row on the
               thesis, refused or not — the attempt is its own record, as every act is
             ONE transaction: thesis.publishedVersionId := head · publishedAt · publishedById ·
               overObjection := (verdict = DISPUTES)
             NO CHAIN WRITE
             ← { thesisId, publishedVersionId, contentHash, publishedAt, overObjection,
                 opened: the pages now PUBLIC_PAGE that were not before }
```

**Publication anchors nothing. Ruled 2026-09-03.** The chain attests the corpus and one thing
only: the SHA-256 of a page as served, one meaning from index zero (evidence §8). A version's
hash on that registry would be a second meaning on the contract that was rotated to have one;
on a second contract it would add a timestamp on the platform's commitment and nothing an
outsider could check that the page does not already give — the hash is on the page, the page is
public, and the archive will capture it for anyone who asks. No research act reaches the chain,
the walk stays the registry's one caller, and the acceptance scan of evidence A7 holds as
written. This answers evidence §5's open question: nothing above the corpus is anchored.

**Publishing again pins the new head.** The previous published version stays in the chain,
reachable from the page as history (T6); nothing is deleted, and the public sees exactly one
version at a time.

### The page — what the reader gets

The public thesis page is the frontend's to render and this document's to specify. It shows:

```
first        the public-interest statement · the legal disclaimer (COMPLIANCE.md, required)
the claim    the version's claim and the thesis's provision, if any
the text     the published version, its hash, its date, its author's handle; each citation
             resolved:
               #ev_   the record — page, timestamps — and the PINNED content version's computed
                      chunks or text; VERIFIED per capture; the FLAG if FLAGGED(m) (evidence A3):
                      withdrawn on <date> for <reason> · content moved on <date>, not re-affirmed;
                      argued: yes, and over the assessor's objection if so — the fact, not the
                      opinion
               #tr_   the trajectory as cited, and whether the newest pass agrees
the appeals  each REQUESTED gap: the request ready to send, its authority, legal basis,
             addresses, the records it rests on, and the instruction (T4)
             each CALLED gap: the call item and how to reach the platform (T4)
the case     the publication rationale — the researcher's words
history      every version that was published, by date, with what changed between them (T6)
the pages    a link to each cited page's public timeline (list_findings): everything the
             researcher looked at, selected or not
NOT shown    the critic's analysis · the assessors' verdicts and objections · framing rounds ·
             the debates — model opinions, GATED, read by researchers; the page shows that an
             analysis was run and that a citation or the publication was made over objection,
             as facts
```

**Model prose does not go public; the researcher's does.** The rationale, the request, the call
and the text are approved words; the analysis, the assessments and the objections are opinions
on them, kept for anyone with a researcher's identity and named on the page as having existed.
The counterweight a reader needs is the corpus (evidence §1), and the page links to all of it.

**Publication opens the pages** (evidence §5): every capture and diff of every page a cited
record belongs to is public from this act, and the act's return names which pages it opened.

**`list_theses`** answers an anonymous caller with published theses only — claim, provision,
published date, author's handle, version hash — and a researcher with their own theses, each
with its head, its published version and whether the two differ (A4).

⚠️ As built, seventeen checks run in one function with two kinds and one non-binding pass; the
tier and the call are gates; figures are hedged per sentence against names from intake; the
rationale, assessment and publication are recorded on the session and the session is CLOSED by
the act; the public route serves the published version with each cited row's summary, tier and
categories, the gap resolutions, and the critic's analysis; the thesis list serves published
theses to the public and heads to a researcher; nothing anchors a thesis and nothing decided
whether it should.

---

## 8. FLOW T6 — AFTER PUBLICATION: FLAGS, WITHDRAWAL, AND THE RETURN PATH FROM THE OTHER END

**A published version never changes, and the platform never changes it.** What changes is what
the platform knows: a cited record's content moves or is withdrawn (evidence §6), a newer
detection pass disagrees with a cited trajectory, a submission or an answer arrives for a gap.
Each is derived on read and shown beside the thing it concerns; each is answered by the
author, by a new version or by withdrawal; and nothing here is silent — not the flag, not the
withdrawal, not the arrival.

### What the author owes, as a list

```
researcher   "what do I owe?"                       — or Claude reports it when a conversation opens
Claude       → list_thesis_reviews()                                         ⚠️ to build
backend      ← one entry per thing owed on the caller's theses, oldest first:
               FLAGGED       a PUBLISHED version's mention with FLAGGED(m): the record, why —
                             withdrawn (reason) or content moved (old beside new, the E3
                             decision that moved it) — and the command: a new version
               STALE_TRAJECTORY  a published or head citation the newest pass contradicts
               ARRIVED       N intake items addressed to gap G of thesis T through the call or
                             the request — the count and the gap; what they are is R12's
               UNARGUED      the head cites a record with no argument (T2's list, repeated
                             here so one read answers the question)
             an empty list is an answer
```

**Stop-shaped, like a walk stop and like the evidence reviews:** material, old beside new, and
one command to paste. It is a read that returns work and changes nothing.

### Answering a flag: a new version, then publish again

```
researcher   reads the flag's material; decides — the record still carries the passage, or it
             does not, or the passage goes
Claude       → add_thesis_version(…)      re-pins to affirmed (T2) · or drops the citation ·
                                          or concedes in the text (T4)
             → open_debate / promote_from_debate   the re-pinned citation argued again (T3)
             → check_publication_readiness · publish_thesis                       (T5)
backend      the new head is published; the previous published version stays in the chain;
             the page shows the new version, and the flag is gone because nothing on the new
             version is FLAGGED — not because anything was cleared
```

**The old version is history, not a mistake erased.** The page's history lists every version
that was published, with its date and what changed between it and the next — the text diff,
computed by the frontend from two immutable texts, and every citation whose pin moved. A
reader who saw the flagged version can find what answered it.

### Withdrawal: the author's act, and a notice where the page was

```
researcher   "withdraw it", with the reason
Claude       → unpublish_thesis(thesisId, reason)
backend      REFUSES NOT_AUTHOR · NOT_PUBLISHED · REASON_REQUIRED
             ONE transaction: thesis.publishedVersionId := null · a WITHDRAWAL row on the
               thesis — the version withdrawn, the reason, who, when
             nothing deleted; every version, mention, argument and decision stays
             ← { thesisId, withdrawnVersionId, withdrawnAt }
```

**The page does not vanish.** An anonymous reader of a withdrawn thesis sees a notice: withdrawn
by its author on this date. Not the text, not the reason — the reason is the author's record,
gated, because it may name exactly what made the text unsafe to publish. A thesis withdrawn
and published again shows the withdrawal in its history between the two versions.

**Opened pages stay open. Ruled 2026-09-03.** Publication opened every cited page's timeline in
full (evidence §5), and a withdrawal does not close it: a public record retracted is the state
this design keeps nowhere, and a reader who checked the corpus behind a thesis must still find
it there after the thesis is gone. PUBLIC_PAGE(page) therefore holds for a page that any version
EVER published cited — evidence A3's predicate is amended by this document (docs that move).

**Unpublishing is the author's act** (evidence §6). Nothing here retracts a thesis on the
platform's initiative — a flag is the honest state, not a takedown. A takedown the operator
performs under a legal demand is COMPLIANCE.md's question, out of scope here and named as such.

### The return path, from the other end

A whistleblower's submission answering a call, or a citizen's FOIA answer sent in through the
request's instruction, arrives through the public's intake channel addressed to a thesis and a
gap — both appeals carry the gap id. From here the flow is three acts this document already
has, once R12 has given the arrived thing a name and a standing:

```
1  the author is told     list_thesis_reviews: ARRIVED, gap G, N items — intake, not evidence
2  the author cites it    a new version names it (T2, the citation kind R12 adds) and argues
                          it (T3) — promoted in light of the thesis, as every record is
3  the gap closes         decide_gap CITED, naming the citation (T4); publish again (T5)
```

Until R12 lands, an arrived item is intake with no name, and nothing in these flows pretends
otherwise: the author is told it exists and the gap stays REQUESTED or CALLED. What an item
IS, how it is held, and what it takes to become a record are R12's (§1).

⚠️ As built, nothing tells an author that a published citation is flagged — the gate does not
re-run and no read lists it; `unpublish_thesis` is any researcher's, sets the pin to null with
the reason on a session, and the public route answers 404 for a thesis with no published
version; a submission becomes a `PENDING_REVIEW` evidence row at intake with no author told.

---

## 9. HISTORY AND NOTES — THERE IS NO SESSION

**Ruled 2026-09-03.** As built, a research session is a row with an id and a status, opened by
one act and closed by another, holding one researcher to one thesis at a time and logging an
event for everything that happens inside it. Every one of those events is a copy of something
that is already its own row, the lock protects nothing the compare-and-set does not, and closing
writes a status flag and one more event. That is the confirmation act again — a ceremony whose
content is elsewhere — and it goes. Nothing is opened, nothing is closed, nothing is held.

| the session provided | what provides it now |
|---|---|
| an attributed, ordered record of what happened | the HISTORY, derived: every act on a thesis is its own attributed, timestamped row |
| a lock — one researcher per thesis, one thesis per researcher | T2's compare-and-set on the head, and the sequence on every decision log; authorship (below) |
| a home for framing rounds before a thesis exists | the FRAMING record (T1): rounds and a choice, attached to a thesis or not |
| a home for a note | a NOTE row on a thesis or a framing |
| "what did I do last time" | the history since a date |

### The history: derived, never logged

```
HISTORY(thesis)   every row that names the thesis, in time order, each attributed:
                  framings and their rounds · versions · arguments (debates) · analyses ·
                  gap decisions · publication attempts · withdrawals · notes
                  — served by the thesis read (get_thesis_context, A4); a date filter is
                    "what happened since"; nothing is written to produce it
```

**No event log exists, and the acceptance suite holds it**: no table whose rows describe other
rows, no `*Event` written beside an act. A log is a second spelling of the history, and it is
the copy that drifts — the as-built log recorded a `VERSION_CREATED` whose preview could differ
from the version, and a `SESSION_CLOSED` that the publish act wrote without anyone deciding to.

### Notes: the one free text with no other home

```
Claude       → add_note({ thesisId | framingId, text })                      ⚠️ replaces add_session_note
backend      REFUSES NO_RESEARCHER · NEITHER (a note names a thesis or a framing) · NOT_AUTHOR
             appends ONE Note: the target · text · researcherId · at
```

A note is attributed and never public. It is not a decision, and no flow reads it as state: a
note that says "gap 3 is resolved" resolves nothing — `decide_gap` does. What a note is for is
what the seven-versus-five correction was: an observation, a dead end, a thing to come back to,
written where it belongs the moment it is found, before or after a thesis exists.

### Authorship: one author, and any researcher may read

**A thesis has one author, and every write on it refuses `NOT_AUTHOR`.** The author is the
researcher who created it; versions, arguments, decisions, framings, notes, publication and
withdrawal are theirs. Any researcher READS any thesis's working state — the head, the
arguments, the analyses, the gaps — because working state is gated from the public, not from
colleagues (evidence A4). Collaboration on one thesis — a second author, a hand-over — is OUT
OF SCOPE and named in §13; the one thesis is the researcher's own (§11).

**Concurrency needs no lock.** Two conversations writing one thesis meet `STALE_HEAD` on the
version and `STALE_SEQUENCE` on a decision log, and the loser reads and writes again. A lock
would have refused the second conversation before it did anything, which is the same outcome
with a row to forget to release.

**Retired, and what each was:**

```
create_research_session · close_research_session · get_session_summary
                        opening, closing and summarising a row whose content lives elsewhere
add_session_note        a note that needed a thesis and a session → add_note
ResearchSession · ResearchSessionEvent
                        the row and its log; framing rounds move to the FRAMING record,
                        publication attempts and withdrawals to their own rows on the thesis
ACTIVE_SESSION_ON_OTHER_THESIS · THESIS_ACTIVE_OTHER_RESEARCHER · NO_ACTIVE_SESSION ·
SESSION_CLOSED · SESSION_ACTIVE_SAME_RESEARCHER
                        the lock's refusals → NOT_AUTHOR, STALE_HEAD, STALE_SEQUENCE
```

⚠️ As built, `ResearchSession` carries `thesisId?`, `question`, `status`, `researcherId`; one is
ACTIVE per researcher; `create_research_session` requires a thesis and `open_thesis_framing`
opens one without; fourteen event types are logged beside the acts they describe; `publish`
closes the session; `unpublish` "requires no session — retraction must never wait on one", which
is the lock's own argument against itself; `add_session_note` requires a `thesisId`.

---

## 10. THE PROSECUTOR'S HOOK — WHERE THE CRITIC WILL READ, AND WHAT IT MAY WRITE

**Designed, deliberately not next, and this document builds nothing of it.** The design is
`docs/gf-prosecutor-dev-plan.md`, ruled 2026-08-30 and re-read under T1: the critic is the
instrument that reads a corpus too large for one head and says *these records, in this order, in
this window, have the shape of a violation of this provision*. It proposes CLUSTERS, never
claims — a claim is chosen at framing, by the researcher (T1) — and it applies a provision as
structure: which record supplies each element, and which element has none. What this section
fixes is the seam: what it reads, what it writes, where its output goes, and what it may never
touch. Its value scales with the corpus, and the corpus is small; that is why it is later.

**Where it reads: the corpus, computed.** Captures' current text versions, diffs' current
content versions, trajectories, and the published theses — to know what has already been
claimed. Never the evidence table (evidence §1: the critic's material is the corpus), never an
analysis, never a debate, never a draft: the plan rules it blind to the critique so that it
finds what the corpus holds rather than what the argument lacks. It reads through the same
gated corpus reads a researcher has, and gains no read of its own.

**The name search is the corpus search, gated.** T2 kept one use of the figure — which records
mention a person — and that use is a phrase search over every text version, opened page or not,
answered for a researcher by the one search rule `verify_claim_text` already implements. No
index table is built: an index would be a derived cache of that read, and it is built the day a
measurement says the read is too slow, not before. Internal, never user-facing, and the
Prosecutor's material exactly as it is the researcher's.

**What it writes: one record of its own, and nothing else.**

```
Claude       → run_prosecutor(provision, window, pages[])                   ⚠️ later
backend      REFUSES NO_RESEARCHER · NO_PROVISION (a run needs the glasses) · NOT_SURVEYED ·
             AWAITING_DERIVATION
             hands the CRITIC: the provision's element shapes (plan §5) · the pages' timelines
               and trajectories in the window · the published theses' claims        paid, once
             → CRITIC: clusters, each an element map — the record that supplies each element,
               by name, or MISSING — with the order and the window; and for each MISSING
               element, the document that would fill it and who would hold it
             AUDITS it, mechanically, as every model actor's output is (T1):
               each named record   exists and is ACQUIRED — an element "filled" by a record
                                   nobody holds is MISSING
               each quoted phrase  checked against the record by the ONE verdict rule
             appends ONE ProsecutionRun: provision · window · pages · the clusters with their
               verdicts · model · promptVersion · runAt · researcherId
             ← the run; each cluster is a CANDIDATE, and the researcher judges it at framing
researcher   → open_framing(question, provision, fromRun, cluster)        T1, pre-filled:
             the elements as the cluster named them, MISSING included — the framing's first
             round starts from the critic's proposal and the researcher's judgement of it
```

**A cluster is not a gap list, a thesis, or a claim.** It becomes a framing when a researcher
opens one from it, a thesis when they create one, a gap when they decide one. The run row is the
whole of the critic's footprint: nothing it says reaches a version, a mention, a gap decision or
a publication except through the researcher's acts, and a run that proposed nothing is a
legitimate record.

**The acceptance test is the plan's §8, unchanged**: on the live thesis it must find the
pre-emptive concession and name it, propose the date of the presentation to the ministry as a
document a request would obtain — a MISSING element, which T4 makes a REQUESTED gap — assert
nothing the corpus does not support, and report the element with no record rather than write
around it. Judged on what it names, never on how it reads.

**What the plan left open, and what this document answers:** whether the Prosecutor writes or
only reports — it writes its run and nothing else; its consumer, without which no tool is run
twice — framing (T1), where a cluster is judged the way the researcher's own proposal is. Which
provisions to enable beyond Article 1 and Article 10 stays the researcher's.

⚠️ As built, nothing: `suggest_thesis` and `ThesisSynthesisAgent`, which wrote a full narrative
from a vector top-k, are retired by the plan §11.1, and no discovery instrument exists.

---

## 11. LEGACY — ONE PARAGRAPH

**The databases are disposable (evidence §8), and every thesis row goes with them.** Staging,
read on 2026-09-03, holds one thesis — published, seven versions, two sessions, its citations
resting on the one DOCUMENT record the evidence design does not carry, and its published text
asserting a claim the raw archive falsifies (`docs/gf-published-thesis-fda-claim-2026-08-30.md`);
four sessions with thirty-one events, one debate, 121 mention rows, no gap resolution, no
whistleblower submission, three key-figure rows. Production, by the plan's record of
2026-08-27 and not re-counted here, holds a framing session of two rounds held at
`create_thesis_draft` and no draft. **Nothing of this is migrated, and nothing is repaired in
place.** The one thesis is the researcher's own, and it is written again under this design —
framed under a provision, its claim chosen after an assessed round, citing corpus records by
name and arguing each, with its gaps decided and its false claim gone because the corpus never
supported it. The framing rounds are archaeology worth keeping in git as they already are, in
the defects document: a machine misquoting a researcher and the researcher refuting it from the
archive, which is honest provenance and does not need a row. Sessions, events, key figures, gap
resolutions and the TipTap bodies are not carried, because the design has no place for them
(§2, §4, §9). The rebuild's order is the refactor plan's step 9 and the cleanup session's; this
document performs nothing.

---

## 12. STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| the FRAMING record: question, provision, author, the thesis it attaches to | `open_framing` · attached by `create_thesis` or by `open_framing` on an existing thesis | any model · the version write |
| the framing's rounds: PROPOSED (verbatim), ASSESSED (with every audit verdict), CHOSEN | `assess_framing` · `choose_framing` — the assessment is the assessor's words, recorded by the tool the researcher called | the assessor directly · anything after the thesis is published, on that framing |
| the Thesis: provision, author | `create_thesis` — once | anything; a different provision is a different thesis |
| `Thesis.headVersionId` | the version write, compare-and-set | any read · any model |
| `Thesis.publishedVersionId`, `publishedAt`, `publishedById` | `publish_thesis` (set) · `unpublish_thesis` (null) | the platform on its own — a flag is derived, a withdrawal is the author's |
| the ThesisVersion: text, `contentHash`, claim, parent, author | the version write — ONE transaction, immutable after | any update, ever; an analysis is its own row |
| the ThesisMention: kind, name, pin | the version write — the pin computed, never supplied | any evidence tool · any model |
| `ThesisMention.debateSessionId` | `promote_from_debate`, on the head's mention · copied by the next version write when (name, pin) is unchanged | anything else — the one write a mention receives after creation |
| the ThesisAnalysis row: fingerprint, the opinion with its verdicts, model, prompt version | `run_analysis` — append-only, one per distinct input | a re-run on a read, a save or a publication |
| the ThesisGapDecision log: gap id, decision, reason, sequence | `decide_gap` — append-only; the decision in force is the latest | the critic — its suggestions are candidates until accepted |
| the PublicationAttempt: rationale, assessment, verdict, refused or published | `publish_thesis`, on every call | — |
| the Withdrawal: version, reason, who, when | `unpublish_thesis` | the platform; the operator's takedown is out of scope |
| the Note | `add_note` | any flow, as state |
| the ProsecutionRun | `run_prosecutor` — later | — |
| the debate, its events, its verdict | evidence §9, unchanged: `open_debate` · `respond_in_debate` · `promote_from_debate` | — |
| the Evidence row, `affirmed`, the REVIEW log | evidence §9, unchanged | any thesis tool — a citation pins `affirmed`, it never moves it |
| the corpus, the registry | the walk | any thesis tool · any research act · publication |

**Derived, never stored:** `CLAIM_FRAMED`, `FINGERPRINT` and `CURRENT_ANALYSIS`, the gap in force
and the gap list, the unargued list, `PUBLISHABLE(version)`, `FLAGGED`, `STALE_TRAJECTORY`,
`PUBLIC_PAGE` (as amended in T6: ever published), the call, the requests, the reviews list,
the history, the names the assessor found. A predicate a pass computed and stored would be a
judgement the pass made; a log written beside an act would be a copy that drifts.

**The three authorities, once more:** the walk writes the corpus and never a thesis row;
research acts write thesis rows — framings, versions, mentions, decisions, attempts,
withdrawals, notes — and never a version of the corpus, an evidence row's standing, or a
registry entry; model actors write opinions — an assessment round, an analysis, a publication
assessment, a prosecution run — each through a tool the researcher called, each audited before
it is recorded, and never a state row. Nothing in this document reaches the chain.

**Nothing is deleted.** A version is never edited; a withdrawn thesis keeps every row; a
dismissed gap keeps its decision; a framing that produced no thesis stays. The single deletion
is the rebuild's drop (§11), once per environment, in its own session.

---

## 13. OUT OF SCOPE OF THIS DESIGN

Each is named so that it is not read as a gap. None is decided here; each says whose it is.

- **The DOCUMENT class** — what a FOIA answer or a whistleblower's submission IS: its identity
  from bytes held, its content version, its standing, what publication opens for it, and the
  path from the public's intake to a record a thesis can cite. R12, scheduled (§1). Until it
  lands an arrived item is intake with no name, the author is told it exists, and the gap it
  addresses stays REQUESTED or CALLED (T6).
- **The public's intake channel** — the submission terms, the encryption, the contact — the
  public's pipeline, as the prosecutor plan rules; R12 designs its far end.
- **The Prosecutor's build** — its prompt, which provisions beyond Articles 1 and 10, its cost;
  this document fixed its hook and nothing else (§10).
- **The public page's rendering** — what a resolved citation, a flag, a request, a call, the
  history and the withdrawal notice look like; the frontend's, against the contract of T5 and
  A5.
- **Collaboration on one thesis** — a second author, a hand-over, a review by a colleague that
  writes anything. One author writes; any researcher reads (§9).
- **The operator's takedown** — a withdrawal on a legal demand rather than the author's word;
  COMPLIANCE.md's, with counsel.
- **The statutory form of the request** — the drafter's prompt: the law it cites, the addresses
  it knows; the drafter's own change, measured by whether requests are answered.
- **Search over the corpus beyond a phrase** — evidence §10's read-tool design; the gated phrase
  search is the instrument here (§10), and an index over it is built on a measurement, not
  before.
- **Notes about a page** — an observation with no thesis and no framing behind it is the
  factual layer's, if it is anything.
- **Bronze Fortress** — untouched by every ruling here.

## VERIFIED BY MEASUREMENT, NOT BY THIS DOCUMENT

Each is a number this design assumes or a cost it states, checked by an instrument rather than
argued. Every one runs read-only, in the container, and lands in a dated findings document.

| what | why it is measured | where it bears |
|---|---|---|
| the framing assessor's verbatim rate — how often `researcherClaim` fails the substring check, on real rounds | decides whether "flag, never drop" costs the researcher a round; the four legacy runs failed it four times | T1 |
| `phraseVerified: ABSENT` on the assessors' and the critic's assertions | the rate at which a model attributes to a record what it does not say — the stock-phrase defect, counted | T1, T4 |
| the assessor's recall on personal names — names it lists against names a reader finds, on the rebuilt thesis | `NAMES_NO_PERSON` is an enumeration under a property; its blind spot is a number, not a hope | T5 |
| the thesis review load — FLAGGED and STALE_TRAJECTORY entries per re-walk and per detection pass, on the rebuilt corpus | the cost T6 states loudly, paid by an author, once per citing version | T6 |
| paid calls per published version — framing rounds, debates, analyses, drafts, the rationale check | the cost of "nothing runs on its own", counted so a later shortcut argues against a number | §2, T4, T5 |
| whistleblower submissions ever received, and intake items per gap once the appeals are live | whether the return path is a scenario the platform meets, and how often | §1, T6 |
| gaps per thesis and their decisions — how many CITED, REQUESTED, CALLED, CONCEDED, DISMISSED at publication | whether `GAPS_DECIDED` is a gate a thesis can pass, and what a thesis's case is made of | T4, T5 |
| the gated phrase search's latency over every text version | decides whether the name index of §10 is ever built | §10 |
| the Prosecutor's acceptance test on the live thesis | the plan's §8, run when the critic exists; judged on what it names | §10 |

**Nothing is OPEN.** What this document does not decide is named above as someone else's or as
a number; the appendix that follows is the contract for everything it does decide.

---

## APPENDIX — THE IMPLEMENTATION CONTRACT

**What a builder reads twice.** Every shape, predicate and refusal the flows imply, stated
once. It composes with `docs/gf-interaction-flows.md` A1–A8 — the page, the capture, the
researcher, `TextVersion`, the walk — and `docs/gf-evidence-flows.md` A1–A7 — the record's
name, `Evidence`, `DebateSession`, `DiffContentVersion`, the predicates VERIFIED, CURRENT,
CITATION_CURRENT, ARGUED, PUBLISHABLE(m), FLAGGED, the six evidence checks — and restates none
of them. Where the flows above and this appendix disagree, the flows win and this is wrong.

### A1. Identity

```
thesis        thesisId (cuid) — evidence A1 takes it as given; this is where it is given
version       versionId (cuid) · contentHash = sha256(utf8(text)) — the text as approved, bytes
framing       framingId (cuid)
mention       (versionId, kind, name) — @@unique; no id of its own is needed by any tool
gap           gapId = sha256(utf8(NORMALISE(description))) — the same gap across runs and
              versions; a re-worded gap is a new gap
analysis      analysisId (cuid) · inputFingerprint (A3)
attempt · withdrawal · note · run
              cuids; reached only through the thesis's history
researcher    from the MCP context; every write REFUSES without one (flows A5)

the citation tokens, in the text:
  #ev_0x<64 hex>     a corpus record by its name — ID(record), evidence A1; nothing else
                     may follow the prefix
  #tr_<cuid>         a ClaimTrajectory.id — the detection pass's row, never a claimHash
  a token the parser cannot resolve is a refusal at the version write, never a plain string

NORMALISE(text)      whitespace collapsed to one space, trimmed — `normaliseClaim` in the
                     trajectory service, and ONE importable symbol: the substring checks of
                     T1 and T4, the gap id, and the trajectory probe all call it; a second
                     spelling of it is a scan failure (A7)
PROVISION            a value from ONE importable table naming each provision and its element
                     shapes (prosecutor plan §5) — e.g. NUREMBERG_1 → [DUTY_HOLDER,
                     KNOWLEDGE_POINT, DISCLOSURE_TIMELINE, DIVERGENCE]; extending the table is
                     the researcher's, in a PR
```

### A2. Data model

```
Thesis                                                             ⚠️ re-shaped
  id
  provision               PROVISION? — one per thesis, optional; never updated
  createdById             REQUIRED — the author (§9)
  headVersionId           String? @unique — the compare-and-set target
  publishedVersionId      String? @unique · publishedAt · publishedById
  publicInterestStatement String?
  createdAt
  REMOVED: title (the claim is the heading) · sessions

ThesisVersion                                                      ⚠️ re-shaped
  id · thesisId
  parentVersionId         String? — the head at the moment of the write; the chain (T2)
  text                    String — Markdown with citation tokens; the record
  contentHash             sha256 over text
  claim                   String — the sentence the thesis argues, verbatim from the choice
  createdById · createdAt
  IMMUTABLE after the write: no column is ever updated
  REMOVED: userContent (TipTap Json) · aiAnalysis · analysisInputHash · status

ThesisMention                                                      ⚠️ re-shaped; evidence A2 amended
  id · versionId
  kind                    EVIDENCE | TRAJECTORY
  name                    String — the fileHash, or the trajectory id
  contentVersionHash      String? — REQUIRED on EVIDENCE; the pin, computed at the write:
                          Evidence(name).affirmedContentVersionHash if the row exists, else
                          CURRENT(record).hash
  debateSessionId         String? — the argument, by reference; written by promote_from_debate
                          on the head's mention, copied forward while (name, pin) is unchanged
  @@unique([versionId, kind, name])
  INVARIANT (evidence A2): where an Evidence row exists, contentVersionHash = its affirmed —
  enforced at the version write, refused STALE_PIN otherwise
  REMOVED: type KEY_FIGURE · type TRACKED_URL · refId · role (evidence A2's optional column,
  withdrawn by this document — prosecutor plan §4.1)

Framing                                                            ⚠️ replaces the thesis-less session
  id · question · provision? · researcherId REQUIRED
  thesisId                String? — set by create_thesis or by open_framing on a thesis
  fromRunId · clusterIndex   String? · Int? — when opened from a ProsecutionRun (§10)
  createdAt
  no status, no closedAt — nothing opens or closes

FramingRound            append-only
  id · framingId · sequence  @@unique([framingId, sequence])
  type                    PROPOSED | ASSESSED | CHOSEN
  content                 Json —
     PROPOSED: { framing: verbatim, elements: [{ element, records: [name…] | MISSING }] }
     ASSESSED: the assessor's output with a verdict beside every assertion:
               contradictions[].quoteVerified · contradictions[].phraseVerified ·
               elements[].filled — plus model, promptVersion
     CHOSEN:   { claim, provision?, elements }
  researcherId · createdAt

ThesisAnalysis          append-only                                ⚠️ to build
  id · versionId · inputFingerprint (A3)
  opinion                 Json — counter-arguments (each with quoteVerified, phraseVerified),
                          suggested gaps, alternative readings, strength
  model · promptVersion · runAt
  @@unique([versionId, inputFingerprint]) — the same input is never paid for twice

ThesisGapDecision       append-only                                ⚠️ replaces ThesisGapResolution
  id · thesisId · gapId · description
  sequence                Int — @@unique([thesisId, gapId, sequence]); the compare-and-set
  decision                OPEN | CITED | REQUESTED | CALLED | CONCEDED | DISMISSED
  citedName               String? — REQUIRED on CITED: a record the head version mentions
  request                 Json? — REQUIRED on REQUESTED: { text, authority, legalBasis,
                          addresses, restsOn: [name…] }
  callItem                Json? — REQUIRED on CALLED: { whatIsNeeded, whoWouldHaveSeenIt,
                          unit, window }
  reason                  String? — REQUIRED on CONCEDED, DISMISSED
  researcherId · createdAt

PublicationAttempt      append-only                                ⚠️ to build
  id · thesisId · versionId · rationale
  assessment              Json — the publication assessor's output, with names it found
  verdict                 SUPPORTS | DISPUTES | null
  outcome                 PUBLISHED | REFUSED · refusedBy String[] (check ids)
  researcherId · createdAt

Withdrawal              append-only
  id · thesisId · versionId · reason REQUIRED · researcherId · createdAt

Note
  id · thesisId? · framingId? — exactly one set, a CHECK constraint · text · researcherId ·
  createdAt

ProsecutionRun                                                     later (§10)
  id · provision · window · pages · clusters Json (with verdicts) · model · promptVersion ·
  researcherId · runAt

REMOVED from the schema: ResearchSession · ResearchSessionEvent · ResearchSessionEventType ·
ResearchSessionStatus · ThesisGapResolution · KeyFigure · ThesisVersionStatus · MentionType's
KEY_FIGURE and TRACKED_URL · Whistleblower's link to Evidence by fileHash (R12's to redraw)
```

**Nothing is deleted, ever, after the rebuild.** Rows are appended; pointers move forward;
versions accumulate.

### A3. Derivations, as predicates

```
AUTHOR(thesis)          thesis.createdById; every write REFUSES NOT_AUTHOR otherwise (§9)
HEAD(thesis)            the version thesis.headVersionId names — stored as a pointer for the
                        compare-and-set, and always the newest version by construction
PUBLISHED(thesis)       the version thesis.publishedVersionId names, or none

CLAIM_FRAMED(v)         ∃ Framing f with f.thesisId = v.thesisId and a CHOSEN round r with
                        r.claim = v.claim and r.provision = thesis.provision, and a round of
                        type ASSESSED in f with sequence < r.sequence                  (T1)

PIN(m)                  m.contentVersionHash — computed at the write, A2
UNARGUED(v)             { m ∈ v.mentions : kind = EVIDENCE and (m.debateSessionId is null
                          or NOT ARGUED(m)) }                                          (T2, T3)
                        — ARGUED(m) is evidence A3's; it also requires the debate's record
                          to be m.name and its thesis to be v's

FINGERPRINT(v)          sha256( v.contentHash ‖ for each EVIDENCE mention, in name order,
                        CURRENT(record).hash ‖ for each TRAJECTORY mention, its id ‖ for each
                        gap in GAP_LIST(thesis), gapId ‖ decision ‖ CRITIC_PROMPT_VERSION ) (T4)
CURRENT_ANALYSIS(v)     the ThesisAnalysis of v with inputFingerprint = FINGERPRINT(v), or none

GAP_IN_FORCE(t, gapId)  the ThesisGapDecision with the highest sequence for (t, gapId)
GAP_LIST(t)             every gapId with a decision, each at its GAP_IN_FORCE; a gap in force
                        CITED whose citedName HEAD(t) does not mention reads as OPEN     (T4)
GAPS_DECIDED(v)         no gap in GAP_LIST(v.thesis) reads as OPEN

TRAJECTORY_CURRENT(m)   the cited computation's currency is PINNED_IS_LATEST or
                        RECOMPUTED_AGREES — the trajectory service's states, unchanged;
                        RECOMPUTED_DISAGREES and NOT_FOLLOWED_BY_LATEST are STALE_TRAJECTORY

PUBLISHABLE(v)          ∀ EVIDENCE m ∈ v.mentions: PUBLISHABLE(m)            (evidence A3)
                        AND ∀ TRAJECTORY m: resolves AND TRAJECTORY_CURRENT(m)
                        AND CLAIM_FRAMED(v) AND CURRENT_ANALYSIS(v) exists AND GAPS_DECIDED(v)
                        AND the thesis has a publicInterestStatement
                        AND the attempt's assessment: rationale has substance, names = []
                        — the gate of T5 is these, one check per conjunct, each calling the
                          predicate; a second spelling is a scan failure

FLAGGED(m)              evidence A3, unchanged
PUBLIC_PAGE(page)       ∃ a version v that was EVER published — v = PUBLISHED(t) now, or v
                        names a Withdrawal or is superseded by a later publication — with an
                        EVIDENCE mention whose record is a capture or diff of the page
                        — evidence A3 AMENDED by T6: opened pages stay open

THE_CALL(t)             PUBLISHED(t) exists → its thesis's GAP_LIST entries in force CALLED,
                        each callItem; else none                                        (T4)
THE_REQUESTS(t)         likewise, REQUESTED, each request
HISTORY(t)              every row naming t, in createdAt order, attributed              (§9)
REVIEWS(researcher)     for each thesis they author: FLAGGED mentions of PUBLISHED(t) ·
                        STALE_TRAJECTORY mentions of PUBLISHED(t) and HEAD(t) · UNARGUED(HEAD(t))
                        · ARRIVED intake items per gap (R12 supplies the count)         (T6)
```

**Every predicate is computed on read and none is stored.** Where one is expensive — VERIFIED
reads the chain — evidence A3's cached verdict applies, and this document adds no cache.

### A4. Tool contracts

**Conventions, shared with flows A5 and evidence A4.** Every refusal is a JSON `{ error, code }`,
never a throw. Every write REFUSES without a researcher (`NO_RESEARCHER`) and, on a thesis, unless
the caller is its author (`NOT_AUTHOR`). PUBLIC reads take no identity and answer identically for
everyone; GATED reads answer any researcher, and return working state. A record is named as
evidence A1 says; a token the parser cannot resolve is `NOT_A_RECORD`; where CURRENT is undefined
the tool refuses `AWAITING_DERIVATION` and names the diff. Every paid call is named as one.

```
list_theses({})                                                       PUBLIC · ⚠️ to build
  returns   anonymous: [{ thesisId, claim, provision, publishedAt, author: handle, contentHash }]
              for theses with PUBLISHED(t); nothing else exists to an anonymous caller
            researcher: their own theses — each with head, published, headIsPublished, the
              framing attached, counts of unargued mentions and open gaps — and every published
              thesis as above
  closes    finding 30: every thesis tool needs an id nobody could list

open_framing({ question, provision?, thesisId?, fromRunId?, clusterIndex? })   WRITE · ⚠️ renamed
  does      creates the Framing; with thesisId, attaches it to an existing unpublished thesis
            of the caller's; with fromRunId, pre-fills the elements from the cluster (§10)
  returns   { framingId, question, provision, elements: [{ element, records: [] | MISSING }] }
  refuses   NO_PROVISION_SHAPE (a provision the table does not know) · NOT_AUTHOR · PUBLISHED
            (the thesis's head is its published version — frame the next version, not this)
            · NO_SUCH_RUN

assess_framing({ framingId, proposedFraming, elements, records: [record…], trajectoryIds })
                                                                      WRITE · paid · ⚠️ re-shaped
  does      loads CURRENT content per record and each trajectory; appends PROPOSED (verbatim);
            → the framing assessor; AUDITS every assertion (T1); appends ASSESSED with verdicts
  returns   { framingId, round, assessment: { candidateFramings, contradictions: [{ researcherClaim,
              quoteVerified, whatEvidenceShows, record, phraseVerified }], unverifiedAssumptions,
              elements: [{ element, filled: bool, records }], recommendedFraming, reasoning } }
  refuses   NOT_YOURS · NO_RECORDS · NOT_A_RECORD · NOT_ACQUIRED · AWAITING_DERIVATION ·
            UNKNOWN_TRAJECTORY_ID

choose_framing({ framingId, claim, provision?, elements })           WRITE · ⚠️ to build
  does      appends CHOSEN — the researcher's words
  refuses   NOT_YOURS · NOT_ASSESSED (no ASSESSED round in this framing) · PROVISION_MISMATCH
            (the framing is attached to a thesis with a different provision — a different
            provision is a different thesis)

get_framing({ framingId })                                            GATED read · ⚠️ renamed
  returns   the framing and every round, verdicts included, and the thesis it attaches to

create_thesis({ claim, provision?, text, framingId? })                WRITE · ⚠️ re-shaped
  does      ONE transaction: the Thesis (provision, author) · the first version by the rules of
            add_thesis_version · attaches the framing (its CHOSEN claim must equal claim)
  returns   add_thesis_version's return plus { thesisId, framingId | null }
  refuses   add_thesis_version's · CLAIM_MISMATCH (framing chosen a different claim) ·
            FRAMING_ATTACHED (to another thesis)

add_thesis_version({ thesisId, text, claim, expectedHeadVersionId })  WRITE · ⚠️ re-shaped
  does      T2's transaction: parse tokens · compute each pin · carry arguments · write the
            version, its mentions, the head pointer
  returns   { versionId, contentHash, mentions: [{ kind, name, pin, argued }], unargued: [name…],
              gapsNowOpen: [gapId…] (CITED gaps whose citation left the text) }
  refuses   NOT_AUTHOR · STALE_HEAD (with the current head) · NOT_A_RECORD · NOT_ACQUIRED ·
            AWAITING_DERIVATION · UNKNOWN_TRAJECTORY_ID · EMPTY (no text, or no claim)

get_thesis_context({ thesisId })                                      GATED read · re-shaped
  returns   the thesis · HEAD and PUBLISHED with their texts and resolved mentions · UNARGUED ·
            GAP_LIST with decisions in force · CURRENT_ANALYSIS or STALE/NONE with the
            fingerprint · the framings · HISTORY(t), optionally since a date

run_analysis({ thesisId })                                            WRITE · paid · ⚠️ re-shaped
  does      T4: FINGERPRINT(head) · → the critic · AUDITS · appends ThesisAnalysis
  returns   { analysisId, inputFingerprint, opinion, suggestedGaps: [{ gapId, description,
              document, holder }] }
  refuses   NOT_AUTHOR · NO_HEAD · ANALYSIS_CURRENT (exists for this fingerprint) ·
            AWAITING_DERIVATION

decide_gap({ thesisId, gapId | description, decision, citedName?, request?, callItem?, reason?,
             expectedSequence })                                      WRITE · ⚠️ the new tool
  does      appends a ThesisGapDecision; a description with no known gapId enters the list
  returns   { gapId, decision, sequence }
  refuses   NOT_AUTHOR · NOT_CITED (CITED names a record the head does not mention) ·
            REASON_REQUIRED · REQUEST_REQUIRED · CALL_ITEM_REQUIRED · STALE_SEQUENCE ·
            NAMES_PERSON (a callItem naming a person, T2 — checked by the same rule as T5)

draft_foia_request({ thesisId, gapId })                               GATED · paid · ⚠️ re-shaped
  does      → the drafter, with the gap, the claim and the records it rests on; writes nothing
  returns   { text, authority, legalBasis, addresses, restsOn }  — passed to decide_gap REQUESTED
  refuses   NO_SUCH_GAP · NOT_AUTHOR

get_whistleblower_call({ thesisId })                                  PUBLIC · re-shaped
  returns   THE_CALL(t) and THE_REQUESTS(t) — both appeals of the published version, with the
            intake instruction; { live: false } when nothing is published or nothing is CALLED
            or REQUESTED; no model, no identity

check_publication_readiness({ thesisId, rationale? })                 GATED · paid iff rationale
  returns   every check of A6 with pass/fail, what it examined, and the failure's subject; with
            a rationale, the assessor's verdict in advance; writes nothing

publish_thesis({ thesisId, rationale, publicInterestStatement? })     WRITE · paid
  does      T5: readiness · → the assessor · a PublicationAttempt, refused or not · the pin
  returns   { publishedVersionId, contentHash, publishedAt, overObjection, opened: [url…] }
  refuses   NOT_AUTHOR · REASON_REQUIRED · NOTHING_NEW · NOT_PUBLISHABLE (with refusedBy and
            each failure's subject)

unpublish_thesis({ thesisId, reason })                                WRITE
  does      T6: the pin to null · a Withdrawal
  refuses   NOT_AUTHOR · NOT_PUBLISHED · REASON_REQUIRED

add_note({ thesisId | framingId, text })                              WRITE · ⚠️ replaces add_session_note
  refuses   NEITHER · NOT_AUTHOR · EMPTY

list_thesis_reviews({})                                               GATED read · ⚠️ to build
  returns   REVIEWS(caller), oldest first, each with its material and one command; an empty
            list is an answer

run_prosecutor({ provision, window, pages })                          WRITE · paid · later (§10)

audit_thesis_claims · verify_claim_text · get_claim_trajectories · get_thesis_trajectory_citations
                                                                      unchanged; the last reads
                                                                      TRAJECTORY mentions
open_debate · respond_in_debate · promote_from_debate · get_debate    evidence A4 — with T3's
                                                                      passage and STALE_PIN
```

**Retired, and what each was:**

```
create_thesis_draft            → create_thesis (the framing is named, not derived)
cite_trajectories              a second version writer                                   T2
run_ai_analysis                → run_analysis; wrote onto the version                    T4
get_research_agenda            embedding hits and a paid rewrite per gap → the gap list  T4
generate_foia_request          → draft_foia_request; wrote nothing and was named as if it did
get_figure_dossier             a per-person aggregation with no source                   T2
create_research_session · close_research_session · get_session_summary · add_session_note
                               there is no session                                       §9
open_thesis_framing · assess_thesis_framing · get_thesis_framing
                               renamed; the session beneath them is gone                 T1
suggest_thesis                 retired by the prosecutor plan §11.1
start_tutorial                 the tutorial's own change; its COMMON_RULES cite this document
preview_diff_classification    an instrument, not a research act (researcher's day)
```

`create_evidence_from_text` and `recover_evidence_from_screenshot` remain R12's, as evidence A4
rules: GATED, their records not citable.

### A5. Routes

**This design adds no route and no browser dialog.** Every research act is an MCP tool; the
public page is a READ. What the page needs is served by the corpus reads of evidence A4 and by
these, all PUBLIC and identity-free:

```
GET /api/thesis                    list_theses' anonymous answer
GET /api/thesis/:id                the PUBLISHED version resolved as T5's page specifies — the
                                   text, each mention resolved with its pin, VERIFIED and FLAGGED,
                                   the appeals, the rationale, the history of published versions,
                                   the withdrawal notice when PUBLISHED(t) is none and a
                                   Withdrawal exists; 404 only for a thesis never published
GET /api/thesis/:id/versions/:v    a version that was ever published — the history's reads
```

**Retired routes** — each was the browser performing a research act, which the prosecutor plan
§10 rules MCP-only, or served a surface that no longer exists: `POST /draft`,
`POST /:id/version`, `POST /:id/analyze`, `POST /:id/suggest-revision`,
`POST /:id/publication-readiness`, `POST /:id/publish`, `POST /:id/unpublish`,
`POST|DELETE /:id/gaps/:gapIndex/resolve`, `POST /:id/foia-request`,
`POST /:id/provenance/repair`, `GET /:id/provenance` (model opinions are gated reads through
MCP), `/mentions/figures`, `/mentions/evidence`, `/figures`, `/figures/:id`.
`POST /:id/gaps/:gapIndex/whistleblower` and its preview are the public's intake, R12's to
redraw; `argumentRoutes` and `chatRoutes` are outside these flows.

### A6. The checks a thesis runs

**The gate is T5's table, and this is its contract.** One check per conjunct of PUBLISHABLE(v)
(A3), each calling the predicate and never re-deriving it; each names what it examined — the
mention, the trajectory, the gap, the framing, the names — and an empty scope says so. The six
evidence checks are evidence A6's, unchanged, and run first. Order and ids:

```
 1 HEAD_VERSION            hard   5 EVIDENCE_VERIFIED        hard   ⎫
 2 CLAIM_FRAMED            hard   6 EVIDENCE_PINNED_CURRENT  hard   ⎪
 3 CITES_EVIDENCE          hard   7 EVIDENCE_ARGUED          hard   ⎬ evidence A6
 4 PUBLIC_INTEREST_STATEMENT hard 8 EVIDENCE_NOT_WITHDRAWN   hard   ⎪
                                  9 EVIDENCE_DERIVED         hard   ⎪
                                 10 EVIDENCE_DIFF_INPUT_SOUND hard  ⎭
11 TRAJECTORIES_RESOLVE    hard  14 GAPS_DECIDED             hard
12 TRAJECTORIES_CURRENT    hard  15 RATIONALE_SUBSTANCE      hard   the assessor; MERIT advisory
13 ANALYSIS_CURRENT        hard  16 NAMES_NO_PERSON          hard   the assessor's list, empty
                                 17 ALLEGATIONS_FRAMED       advisory
```

**There is no non-binding pass.** Evidence A6's one arm — a DOCUMENT mention passing with
`binding: false` — has no population until R12, and R12 decides whether it survives. Every check
above binds or is advisory by name.

**After publication nothing re-runs** (evidence A6). `check_publication_readiness` on a thesis
whose head is its published version reports FLAGGED and STALE_TRAJECTORY as information and
writes nothing; `list_thesis_reviews` is where an author reads them.

### A7. The instruments, and what each turns from a claim into a measurement

Every instrument runs read-only inside a deployment, environment stated twice (`CLAUDE.md`),
and writes its own ledger record. **None is proven until it has been observed to FAIL** (plan
§4): each lands with the breakage that makes it exit non-zero, recorded in its test.

```
thesis-cites-verified      Level 9     npm run forensics:audit-theses -- --env <env>
  the ledger's existing entry, given its command. For every version that is PUBLISHED(t):
  PUBLISHABLE(v) — the six evidence predicates per EVIDENCE mention, TRAJECTORY_CURRENT per
  trajectory, CLAIM_FRAMED — and FLAGGED per mention
  exit 0: every published version publishable and unflagged · exit 2: flagged or stale
  citations — an expected state, listed · exit 1: a published version that is not
  PUBLISHABLE by any conjunct the flag does not cover — the gate did not hold
  dependsOn: the predicate module (one importable symbol each) · this script

thesis-no-log              §9          a schema and source scan, in the suite
  no model named *Session or *Event references a thesis, version, framing or gap; no module
  under src/ writes a row whose only content describes another row

versions-immutable         T2          a source scan, in the suite
  `thesisVersion.update` and `updateMany` have no caller under src/; exactly ONE module calls
  `thesisVersion.create`; the test that writes twice against one head watches the second
  refuse STALE_HEAD

models-write-no-state      §2          a source scan, in the suite
  the model-actor modules — the framing assessor, the debate assessor, the critic, the
  drafter, the publication assessor, the Prosecutor — import no database client; their
  output reaches a row only through the tool that called them, after the audit

one-symbol                 A1, A3      a source scan, in the suite
  NORMALISE · PROVISION · CLAIM_FRAMED · FINGERPRINT · GAP_IN_FORCE · PUBLISHABLE(v) each have
  one importable symbol and the gate calls it; a second `replace(/\s+/g, ' ')` in a verbatim
  or identity path is the copy that drifts, and today there are three

pin-equals-affirmed        T2          evidence A7's test, unchanged and owned here: move
  `affirmed` between two writes and watch the second refuse STALE_PIN

gap-id-stable              T4          a unit test: the same description with different
  whitespace yields one gapId; a re-worded description yields another; decisions carry

names-vacuity              T5          a test: a version naming a known person fails
  NAMES_NO_PERSON, and the passing report names how many names it examined — a pass that
  examined nothing says zero, never nothing

retired-names              A4, A5      the factual layer's step-0 scan, extended by this
  document's retired tools, routes and models
```

**The measurements of §13 are instruments too**, read-only by construction:

```
forensics:measure-assessor-verbatim -- --env <env>    quoteVerified rate over framing rounds
forensics:measure-phrase-verified -- --env <env>      phraseVerified: ABSENT over assessments
                                                       and analyses
forensics:measure-name-recall -- --env <env>          the assessor's names against a reader's
                                                       list, on the rebuilt thesis
forensics:count-thesis-reviews -- --env <env>         FLAGGED and STALE_TRAJECTORY per re-walk
forensics:count-paid-calls -- --env <env>             rounds, debates, analyses, drafts,
                                                       attempts per published version
forensics:measure-phrase-search -- --env <env>        the gated search's latency (§10)
```

**The acceptance suite holds these on every refactor step**, as the flows' and evidence's
suites hold theirs — a step that breaks one is not a step:

- no thesis tool reaches the chain or writes an evidence row's standing: a source scan that
  the registry's `submit` still has ONE caller (evidence A7) and that `Evidence.status` and
  `affirmed` have no writer outside `promote_from_debate` and `review_evidence`
- the version write is one transaction and the only writer of versions and mentions, and
  `debateSessionId` has exactly one other writer, `promote_from_debate`
- every write refuses `NOT_AUTHOR`: a test calls each write tool as a second researcher
- the public reads answer identically with and without identity, and a thesis never
  published is 404 while a withdrawn one is a notice
- model prose never reaches a public read: a shape test on `GET /api/thesis/:id` that no
  field of any analysis, assessment or objection appears in it
- the retired names of A4 and A5 do not exist as tools, routes, exports or models
