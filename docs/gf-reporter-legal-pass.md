# Adverse-Outcome Reports — Legal & Compliance Pass (Phase 10)

**Status:** first pass done 2026-08-21. **Not a substitute for legal review** — see §6.
**Scope:** every user-facing claim the adverse-outcome report feature makes, across the public intake
form (`/{he,en}/reports/new`), the researcher-gated pattern display (`/{he,en}/reports/patterns`), and
the homepage CTA. Audited against `defamation-risk.md` (Israel, חוק איסור לשון הרע 1965) and GDPR
Art. 9.

This feature's legal profile is **unlike anything else in Glass Fortress**, which is why it needed its
own pass rather than reuse of the existing components:

- Every other public surface makes claims about **named individuals**, and `defamation-risk.md` is
  written for that. This one names **no individual at all** — no free text, no names, by design (§2.10
  of the schema plan). The classic exposure is absent.
- What it does instead is collect **special-category data from the public** (health, and religious
  belief via one answer) and publish **aggregate claims** derived from it. That is a GDPR problem and a
  corporate-defamation problem, not a personal-defamation one.

---

## 1. Findings

Ranked by exposure. Each says what was actually changed.

### 1.1 HIGH — A named manufacturer beside a harm count

`/reports/patterns` can break counts down by `vaccineManufacturer`, rendering e.g. **"פייזר — 412
דיווחים"**. A commercial entity named next to a harm figure, derived from unverified self-reports, is
the highest-exposure element in the feature:

- Corporations can sue under חוק איסור לשון הרע.
- The truth defence's burden falls on **us** (`defamation-risk.md`, Governing Law).
- Self-reported, unverified data cannot discharge that burden.

**Not removed, because the dimension is legitimate and well-precedented**: official pharmacovigilance
systems publish manufacturer-stratified counts, for the real reason that reaction patterns differ
between products. Removing it would also break the feature's stated method of following what official
surveillance does.

**Mitigated instead**, with framing that matches those systems' own: a caveat stating a count beside a
manufacturer means *reports naming that product* — not harm attributed to that company, and not a
finding against it. It renders **only when that breakdown is selected**, so it appears exactly where
the risk does rather than as boilerplate readers learn to skip.

**Open for legal review**: whether this framing is sufficient, or whether the manufacturer breakdown
should stay researcher-only permanently even after the rest of the page goes public.

### 1.2 HIGH — Art. 9 consent was bundled with nothing, but rested on an assumption

Consent covered storage and publication of health data. It did **not** ask the reporter to declare the
report is their own genuine experience. Without that, the dataset has no stated basis for being
anything other than arbitrary — and the aggregate claim built on it inherits that weakness.

**Changed**: a **separate** declaration checkbox — "this describes what happened to me, to the best of
my knowledge — not something I read about, invented, or am submitting on behalf of someone else."

Deliberately a second checkbox, not appended text. Art. 9(2)(a) consent must be **specific and
unbundled**; folding a factual declaration into the consent would weaken the very thing that makes
processing health data lawful. They are also different legal acts — one grants permission, the other
asserts a fact — and only the second is what an aggregate claim rests on. This mirrors the
Whistleblower flow's separate "legally obtained material" declaration.

### 1.3 MEDIUM — Irrevocability was disclosed after the fact

That a report can never be found, corrected, or deleted (the true-anonymity corollary, §2.8) was
stated only on the confirmation screen, i.e. **after** submission. Consenting to something
irreversible requires knowing it beforehand.

**Changed**: stated at the point of consent, in the consent block itself.

### 1.4 MEDIUM — No public-interest anchor (Rule 5)

`defamation-risk.md` Rule 5 requires every published claim surface to open by anchoring itself in
public interest — this is what activates the s.15 defence. The pattern display had none.

**Changed**: a "why this exists" anchor at the top of the legal frame on `/reports/patterns`.

### 1.5 MEDIUM — The AI disclaimer would have been the wrong label

The obvious move was to reuse the shared `LegalDisclaimer` component. It is headed **"ניתוח AI"** and
exists to mark AI-generated analysis. Nothing on the pattern page is AI-generated — it is arithmetic
over self-reports — so reusing it would mislabel the content **and** dilute a label other pages depend
on for their own protection.

**Changed**: a separate `LegalFrame`, carrying the Rule 5 anchor and a Rule 1 statement that a report
records what someone experienced *after* vaccination, not that vaccination caused it.

### 1.6 RESOLVED BEFORE THIS PASS — contact-info storage

The schema plan listed "privacy review of how verified contact info is stored (encrypted-at-rest, or
discarded post-verification — undecided)". **Moot**: §2.8 settled it — nothing is stored, the verifying
account is deleted inside the same request, and that was verified against the live staging database
(`auth.users` holds only the researcher's own row). No further work.

---

## 2. What was already right

Recorded so a future pass does not re-litigate it:

- **No free text anywhere.** The single largest defamation and re-identification surface in a public
  intake form does not exist here (§2.10).
- **No individual is ever named or nameable** by a reporter.
- **Aggregate-only publication**, enforced server-side, with disclosure control that drops suppressed
  cells entirely and withholds any total that would let one be recovered by subtraction (Phase 6b).
- **Rule 1 framing already present** in the caveat: "these counts show what people have reported, not
  what has been proven."
- **Epistemic tiering** (Phase 9) already satisfies Rule 2's spirit — categories do not render with
  visual weight their evidence does not support.

---

## 3. Deliberately not done

- **Ungating `/reports/patterns` for the public.** Out of scope for a first pass; it should follow
  external review (§6), not precede it.
- **A full terms-of-use page.** The declaration covers the reporter's own assertion. A general terms
  document is a site-wide concern, not this feature's.
- **Excluding `UNDISCLOSED` vaccination-status rows from directional claims** (§ Phase 8b). Still
  owed, still not reachable — no aggregate can clear the threshold yet — but it must land before the
  page goes public, since a directional claim built on rows that decline to state direction would be
  the exact overstatement Rule 1 forbids.

---

## 4. Changes in this pass

| Change | Where |
|---|---|
| Separate truthfulness declaration | `reports/new` review step |
| Irrevocability moved to point of consent | `reports/new` review step |
| `LegalFrame` — public-interest anchor + not-causal statement | `reports/patterns` |
| Manufacturer caveat, conditional on that breakdown | `reports/patterns` |
| Bilingual copy for all of the above | `messages/{he,en}.json` |

No schema change, no migration, no API change.

---

## 5. Residual risk

- The manufacturer breakdown remains the highest-exposure surface, mitigated by framing rather than
  removed (§1.1).
- Reports are **unverified by construction**. That is the model's design, not a defect — but it means
  no claim built on them can ever be stronger than "this is what people reported."
- The declaration is a stated assertion, not a verified one. It establishes good faith; it does not
  establish truth.

---

## 6. This is not legal advice

Everything here was written by a non-lawyer working from `defamation-risk.md` and the GDPR reasoning
already recorded in the schema plan. It is a **structured audit and a drafting pass**, intended to make
external review cheap and specific — not to replace it.

`defamation-risk.md`'s own checklist already requires an Israeli media/defamation lawyer to review
public-facing copy, and marks it explicitly as "external — not a code task". That requirement covers
this feature too. Two items specifically want a lawyer's eye before anything here reaches production:

1. Whether the manufacturer-breakdown framing (§1.1) is sufficient, or whether it must stay gated.
2. Whether the consent + declaration pair is adequate under Israeli law for collecting health data
   from the public, given the data is published in aggregate and can never be withdrawn.
