# A researcher's day on the platform — the flows, read as a day

**What the two flows documents look like from the chair.** The mechanism is
`docs/gf-interaction-flows.md` (the corpus) and `docs/gf-evidence-flows.md` (evidence); the
reasoning is `docs/gf-architecture-target.md`. This is neither: it is one working day, in order,
with the MCP tool that carries each step in parentheses, so that the surface can be read against
the work it exists for. Written 2026-09-03 with the researcher, under the design as signed off.

> **STATUS.** ⚠️ marks a tool that does not exist yet or exists under another name; everything else
> is on the MCP surface today. The marking page is a browser, not a tool. Where a step has no tool
> at all, the last section says so — those are the surface's gaps, found by walking the day.

---

**The claim the day serves.** The researcher is trying to establish that the Israeli government
and the Ministry of Health violated the Nuremberg Code during the Covid years — its first
principle, informed consent: a person cannot consent to a medical intervention while the state
withholds or alters what it knows about the risks. And they want theses that end in a focused
call for whistleblowers and in FOIA requests, because a court case is made of what the corpus
cannot show.

## Morning: the corpus

The session opens by confirming which environment it is talking to, staging or production, by
configuration and chain rather than by content (`get_environment`).

The question for the corpus is concrete: what did the ministry's pages say about risks, and when
did that change? The researcher names the ministry's vaccine safety page and the adverse-event
reporting page in the chat, and the survey answers in seconds — three thousand captures in the
archive, two hundred that differ, held from 2020 to today (`survey_wayback_captures` ⚠️, today
`start_forensic_scan`). They start the walk (`scan_captures` ⚠️). It stops on the first capture,
because nothing has been judged yet; they open the marking URL from the stop in a browser, mark
the menus, the footer and the "more news" box as furniture, and paste the approval back
(`approve_article_rules` ⚠️, today `calibrate_article_rules` and `correct_article_rules`). The
walk runs on (`scan_captures` again).

Over the next hour it stops a dozen times: a rule went silent after a redesign, a removed block
nobody has seen yet, the classifier calling one change "not editorial". Each stop shows its
material and asks one question. The researcher answers in the page and approves
(`approve_article_rules`), or declares a capture unusable with a reason (`resolve_scan_stop` ⚠️).
When they want to see where the page stands, the rules in force and the pending stop are one read
away (`get_article_rules`, `list_captures`).

By late morning every real change on both pages is stored, anchored as it was stored, and diffed
against its predecessor. Nothing in that hour was a research judgement about the mission. It was
calibration: what on this page is the article.

## Midday: the timeline, and the thesis

They ask for the page's timeline (`list_findings` ⚠️, today `get_forensic_timeline` and
`get_scan_findings`). It comes back in date order, every capture and every diff, with the
classifier's opinion shown as an opinion and never as the order. They read. On 2022-05-25 a
paragraph on the mechanism and its duration leaves the page; they pull the two texts and the
chunks to be sure (`get_diff_input`). On 2025-06-01 the link to the adverse-event reporting
channel is removed. They search the corpus by text for the public message at the same time and
find the news article quoting the ministry that the vaccine is safe and effective, captured the
same week (`verify_claim_text`). Across the page's whole history they ask which claims were
removed and never came back (`get_claim_trajectories`), because "removed and never restored" is
the strongest shape a Nuremberg claim can take, and it is a trajectory rather than a diff. None of
these is evidence yet. They are facts the corpus holds.

Now they open a thesis, or return to last week's (`create_research_session`,
`get_thesis_context`). The framing tools push back on the claim's wording before any evidence is
touched, because the assessor is there to find what a hostile reader would find
(`open_thesis_framing`, `assess_thesis_framing`, `get_thesis_framing`). Then they write, and the
version is saved with its citations inside the text, each record named by its corpus name
(`create_thesis_draft` for the first version, `add_thesis_version` after), and the trajectory
about the risk statement pinned beside the diffs (`cite_trajectories`,
`get_thesis_trajectory_citations`). The sentence that matters reads: "While the ministry told the
public the vaccine was safe and effective, its own page stopped telling them how to report harm."
A note records the seven-versus-five correction they found on the way (`add_session_note`).

## Afternoon: the argument, and what the corpus cannot say

For each citation they open a debate (`open_debate` ⚠️, today `open_diff_debate` without a
thesis). The tool refuses if the thesis does not actually cite the record, and it refuses if the
record's own survival check contradicts it. Otherwise the assessor reads the argument against the
passage that cites it and answers whether the researcher made specific, falsifiable claims. It
may dispute the merit; the researcher answers once (`respond_in_debate` ⚠️, today
`respond_in_diff_debate`), reads the state (`get_debate` ⚠️, today `get_diff_debate`), and
promotes (`promote_from_debate` ⚠️, today `promote_from_diff_debate`). The record is now
evidence: selected, argued, attributed, pinned to the version they read. No chain write, no
confirmation, nothing to wait for. If they want to see what an outsider would see when following
that citation, one read resolves the name to the record, its verification and its published
citations (`resolve_record` ⚠️), and the captures beneath it can be checked against the registry
(`check_on_chain_status`, re-scoped to captures).

Then the honest part. The corpus shows what the page said and when it changed. It cannot show who
decided, what they knew, or what the reporting numbers were. Those are the gaps, and a court case
is made of exactly those. The devil's-advocate analysis lists them (`run_ai_analysis`), the agenda
orders what the thesis still needs (`get_research_agenda`), and the researcher resolves each gap
into one of two things:

- **A FOIA request**, generated from the gap (`generate_foia_request`): the committee protocol
  for the decision taken between these two dates, the adverse-event counts for that quarter, the
  internal instruction to remove the reporting link. Each request names the record it rests on,
  so the request itself carries the proof that the change happened.
- **A whistleblower call**, published with the thesis and narrow on purpose
  (`get_whistleblower_call`): not "tell us about corruption", but "if you were in the ministry's
  digital or safety unit in May 2025 and saw the instruction to remove the reporting link, this
  is what we need and this is how to reach us". A focused call gets a focused answer, and a
  focused answer is admissible.

## Evening: publication, and the day after

Publication readiness runs its checks (`check_publication_readiness`): every cited record
verified against the chain, pinned to its current version, argued, not withdrawn; the thesis's
prose checked against the archive and its figures hedged (`audit_thesis_claims`); claims framed
as allegations under investigation, officials named in their official capacity, because truth is
the only defence under Israeli defamation law and the burden is the platform's. The thesis
publishes (`publish_thesis`) with its evidence, its FOIA requests and its whistleblower call, and
the session closes with its record (`get_session_summary`, `close_research_session`).

From that moment the pages it cites are public in full, every capture and every diff, the ones the
thesis uses and the ones it does not. A reader who suspects cherry-picking can look at everything
the researcher looked at (`list_findings`, without an identity).

Next week a rule correction re-walks one page (`approve_article_rules` on a stored capture, then
`scan_captures`). Two promoted records' content moves. The researcher's morning starts with one
question, "what do I owe", and a list: old beside new, the argument each one supports, one command
per record (`list_evidence_reviews` ⚠️). They re-affirm one and withdraw the other with a reason
(`review_evidence` ⚠️, replacing `delete_evidence`). The published thesis now shows a flag beside
that citation, visible to everyone, until its author issues a new version (`add_thesis_version`,
`publish_thesis`). If they ever need to withdraw the whole thesis, that too is their act
(`unpublish_thesis`). Nothing was deleted, nothing was silently fixed, and the public record says
what happened.

That is the shape of the day: an hour of calibration that judges nothing, a corpus that holds
everything, a thesis that selects and says why, and a public surface where the selection and the
counterweight are both in view.

---

## What the day found about the surface

**Steps with no tool behind them.**

- **Returning to last week's thesis.** Every thesis tool needs a `thesisId` and nothing lists
  them (finding 30). `list_theses` belongs to the thesis flows.
- **Recording a gap resolution.** The resolution of a gap into a FOIA request or a call is
  written on the site; no tool records it. The thesis flows'.
- **The return path.** A FOIA answer is a document. A whistleblower's submission is a document.
  Both are the DOCUMENT class, which is parked — so the artefacts the day produces to make a
  claim court-applicable have no path back into the corpus yet. The DOCUMENT discussion is the
  second half of the court path, not a side topic.
- **A note before a thesis exists.** Framing produces corrections, and `add_session_note`
  requires a `thesisId` (recorded at Level 9).

**Tools that exist, are not retired, and the day never called.** `get_figure_dossier`, which
aggregated evidence by named official and loses half its source when figures leave the evidence
row — it re-homes to theses' mentions, and it is a defamation surface, so that is not optional.
`preview_diff_classification`, a diagnostic that previews the classifier — under the design the
classifier runs once at acquisition, so it is an instrument, not a research act. `reset_article_
calibration` and `start_tutorial`, a recovery act and onboarding, correctly absent from a normal
day. `create_evidence_from_text` and `recover_evidence_from_screenshot`, the parked class.

**Retired by the design and correctly absent.** `create_evidence_from_url`,
`promote_scan_findings`, `promote_evidence`, `search_evidence`, `delete_evidence`,
`enrich_evidence_with_history`, `suggest_thesis`, and the eleven Level 4 tools the flows document
already replaced.

**Count for this day:** seven tools to build, four renamed, six retired — the evidence document's
appendix A4 lists them; and two to add on the thesis side, `list_theses` and the gap resolution.
