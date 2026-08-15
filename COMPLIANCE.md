# Legal Compliance Guidelines

This document governs how Glass Fortress handles claims, evidence, and public-facing content to minimize legal risk — particularly defamation liability — while fulfilling its mission of public-interest legal investigation.

All contributors, researchers, and AI prompt authors must read and follow these guidelines.

---

## Governing Legal Framework

**Primary:** Israel — חוק איסור לשון הרע, 1965 (Defamation Prohibition Law)
- Civil and criminal liability for false statements of fact that damage a person's reputation
- Truth is an absolute defense — burden of proof lies with the defendant
- **Available defenses:** Truth · Public interest · Good-faith opinion based on documented facts
- Public officials acting in their official capacity are subject to reduced protection and greater scrutiny

---

## Defamation Risk Surfaces

### HIGH RISK

**AI-Generated Content About Named Individuals**
The AI agents (DevilsAdvocateAgent, ThesisSynthesisAgent, FoiaLetterAgent) generate Hebrew text that references named public officials. If AI output asserts facts beyond what the cited, hashed evidence directly supports, the truth defense may fail.

**Public Call Pages (`/call/[thesisId]`)**
These pages are publicly shareable and name officials while making specific allegations. They require a human review gate and a legal disclaimer before publication.

### MEDIUM RISK

**User-Written Thesis Bodies**
Researchers write content naming officials and making factual claims. The platform publishes and structures this content, placing it closer to publisher than neutral host under Israeli law.

**Key Figures Dossier Pages (`/figures/[id]`)**
Aggregating all evidence and theses about a single named individual into one page could be construed as a coordinated reputational attack. Frame these pages as evidence indexes, not accusation records.

### LOW RISK

**Whistleblower Submissions**
User-submitted documents may contain defamatory material about third parties. Mitigated by submission terms requiring users to declare materials were legally obtained.

---

## Legal Framing Rules

These rules apply to all content produced by AI agents, researchers, and UI copy.

### Rule 1 — Allegations, Not Conclusions

| Prohibited | Permitted |
|------------|-----------|
| "X concealed safety data" | "Evidence suggests X may have concealed safety data" |
| "X lied to the public" | "The documents indicate X presented incomplete information to the public" |
| "X committed fraud" | "We are investigating whether X's conduct constitutes a breach of disclosure duty" |

Use: `הראיות מצביעות על` · `ייתכן כי` · `על פי המסמכים` · `אנו חוקרים האם`

### Rule 2 — Stay Within the Evidence

Every factual claim must be traceable to a specific, cited, SHA-256 hashed evidence record.
If a claim cannot be traced to a specific evidence hash — it must not be stated as fact.
AI agents must never extrapolate beyond what the cited evidence directly supports.

### Rule 3 — Label AI Output as Analysis

Every AI-generated section must carry a visible label:

> **ניתוח AI — אינו מהווה קביעה שיפוטית**
> AI Analysis — does not constitute a judicial finding

### Rule 4 — Official Capacity Only

Claims about named individuals must reference their official role and documented acts — never personal character.

| Prohibited | Permitted |
|------------|-----------|
| "X is corrupt" | "In their capacity as Director General, X signed [document hash] authorising [act]" |
| "X is dishonest" | "X's public statement on [date] contradicts the internal protocol dated [date]" |

### Rule 5 — Public Interest Anchor

Every thesis and call page must open with a statement anchoring the investigation in public health interest. This activates the public interest defense under חוק איסור לשון הרע s.15.

---

## Required UI Elements

### Legal Disclaimer

Must appear on: every thesis page · every `/call/[thesisId]` page · every key figures dossier page.

**Hebrew:**
> כל הטענות המוצגות מבוססות על ראיות מתועדות ומהוות ניתוח משפטי בתום לב בעניין ציבורי.
> אין בהן קביעה שיפוטית. הפלטפורמה מציגה חומר לצורך חקירה ציבורית בלבד.

**English:**
> All claims presented are based on documented evidence and constitute good-faith legal analysis on a matter of public interest. They do not constitute a judicial finding. This platform presents material for purposes of public investigation only.

### Whistleblower Submission Terms

Must be acknowledged before any anonymous document upload:

> אני מצהיר/ה כי המסמכים שאני מעלה הושגו באמצעים חוקיים, ואני מתיר/ה את השימוש בהם לצורך החקירה הציבורית.
>
> I declare that the documents I am uploading were obtained by lawful means, and I authorise their use for the purposes of this public investigation.

---

## AI Agent Prompt Requirements

Every AI agent that generates content about named individuals must include the following constraint in its system prompt:

```
LEGAL FRAMING:
All claims about named individuals must be framed as allegations under investigation,
not established facts. Never assert conclusions beyond what the cited evidence directly
supports. Use hedged language: 'הראיות מצביעות על', 'ייתכן כי', 'על פי המסמכים'.
Reference official roles and documented acts only — never personal character.
Every factual claim must be traceable to a specific cited evidence hash.
```

---

## Additional Legal Exposure Areas (Non-Defamation)

Identified 2026-08-15. These apply to the platform operator, not only to content.

### State Secrets Risk (חוק העונשין §114)

If a whistleblower uploads a classified government document and the platform publishes AI-derived metadata from it (dates, actors, categories), the operator may be exposed even without publishing the document itself. The Whistleblower Submission Terms declaration (see below) partially mitigates this by shifting responsibility to the submitter — but it is not a complete shield.

**Mitigation pending:** Legal counsel guidance on whether editorial review of AI-extracted metadata is required before publication to a thesis.

### Privacy Law (חוק הגנת הפרטיות תשמ"א-1981)

The platform processes personal data on named individuals (government officials). Operating a database of personal information may require registration with the Privacy Protection Authority (רשם מאגרי המידע). A published privacy policy is required.

**Mitigation pending:** Privacy policy document + assessment of whether registration threshold is met.

### Absence of Press Status

Journalistic organisations in Israel have specific source-protection rights not available to general platforms. The platform currently has no formal press standing. This means that in response to a court order, the operator has no statutory source-protection defence that a newspaper would have.

**Mitigation to consider:** Formal association with a recognised journalistic body, or obtaining legal opinion on whether the platform's investigative mission qualifies for equivalent treatment under Israeli law.

---

## Open Compliance Tasks

Tasks identified but not yet implemented. Must be resolved before broad public launch.

- [ ] **Whistleblower submission declaration UI** — A checkbox/acknowledgement must appear in the upload modal before the user can submit. Hebrew and English text is specified under "Required UI Elements" below. Currently absent from the upload flow.
- [ ] **Privacy policy** — A published, linked privacy policy page is required under חוק הגנת הפרטיות. Must cover: what data is collected, retention periods, third-party processors (Supabase, Pinata, Railway), and subject rights.
- [ ] **Terms of service** — Establishes permitted use, user declarations (legally obtained documents), and platform liability limits. Required before any public-facing upload feature is live.
- [ ] **Legal counsel review** — An Israeli lawyer specialising in media/communications law must review: (a) the safety page, (b) the call page copy, (c) the submission terms, and (d) the privacy policy before broad launch.

---

## Pre-Launch Checklist for Public-Facing Features

Before any feature that names individuals or makes allegations goes live:

- [ ] Legal disclaimer component present and visible
- [ ] All AI-generated sections labeled "ניתוח AI"
- [ ] Human review gate: a researcher has explicitly approved the content
- [ ] All claims traceable to cited evidence hashes
- [ ] Whistleblower submission terms in place (if feature accepts uploads)
- [ ] External review: Israeli media/defamation counsel has reviewed copy for high-risk pages

---

## Researcher Responsibilities

Researchers with write access agree to:

1. Assert only what the evidence directly supports
2. Cite a specific evidence hash for every factual claim in a thesis
3. Use the legal framing rules above in all thesis content
4. Not submit fabricated, altered, or illegally obtained documents
5. Not make personal character attacks on named individuals — only document official acts

Violation of these rules may result in access revocation and, if content causes legal harm, personal liability that the platform does not indemnify.

---

## Document History

| Date | Change |
|------|--------|
| 2026-08-09 | Initial version — defamation risk analysis, framing rules, UI requirements |
| 2026-08-15 | Added: state secrets risk, privacy law exposure, press status gap, open tasks section. Safety page copy reviewed and neutralised (court-defiance framing removed, key-storage claim corrected). |

*This document must be updated whenever new public-facing features are added that reference named individuals or make factual allegations.*
