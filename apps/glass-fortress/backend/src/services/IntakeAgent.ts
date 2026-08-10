import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

// ---------------------------------------------------------------------------
// Evidence tier enum — business/legal classification
// ---------------------------------------------------------------------------

export const EVIDENCE_TIER = {
  ANECDOTAL: 'Tier 4: Anecdotal',
  SUPPORTING: 'Tier 3: Supporting',
  MATERIAL: 'Tier 2: Material',
  SMOKING_GUN: 'Tier 1: Smoking Gun',
} as const;

export type EvidenceTier = (typeof EVIDENCE_TIER)[keyof typeof EVIDENCE_TIER];

// ---------------------------------------------------------------------------
// Zod output schema
// ---------------------------------------------------------------------------

export const IntakeOutputSchema = z.object({
  evidenceRole: z
    .enum(['Incriminating', 'ContextAnchor'])
    .describe(
      'The fundamental role of this document in the legal case. ' +
        '"Incriminating" — the document directly shows a state or corporate actor concealing, coercing, or misleading. ' +
        '"ContextAnchor" — a neutral, official document (e.g. FDA/WHO announcement, scientific publication) that establishes a verifiable fact, date, or baseline against which incriminating conduct can be measured.',
    ),

  isRelevant: z
    .boolean()
    .describe(
      'Whether the submitted content is relevant to the Covid-19 policy lawsuit. ' +
        'Set true for BOTH Incriminating evidence AND ContextAnchor documents that establish a factual baseline (e.g. regulatory approval dates, official announcements, scientific consensus at a specific time). ' +
        'Set false only for content with zero legal value: memes, satire, unrelated topics, vague political opinion.',
    ),

  category: z
    .enum(['Side Effect Withholding', 'Regulatory Misleading', 'Coercion', 'Other', 'Factual Baseline'])
    .describe(
      'The legal category of this evidence. ' +
        'For Incriminating evidence: choose the offense category that best fits. ' +
        'For ContextAnchor evidence: always use "Factual Baseline".',
    ),

  summary: z
    .string()
    .describe(
      'A 3-4 sentence summary in highly professional Hebrew. Structure it as follows:\n' +
        '  Sentence 1: What is this document — who issued it, when, and what it formally contains.\n' +
        '  Sentence 2: What specific act, tactic, or Modus Operandi does it reveal (e.g. "הסתרת נתוני תופעות לוואי", "גיוס ידוענים ליצירת לחץ חברתי", "ניסוח מסע שכנוע ללא גילוי מעמד ה-EUA"). Do not just say "they lied" — explain precisely HOW.\n' +
        '  Sentence 3 (Incriminating only): Explain WHY this constitutes a legal violation — connect the documented act to the applicable legal theory (e.g. informed consent, Nuremberg Code, misleading a regulator). For ContextAnchor evidence, use this sentence to state what factual baseline this document establishes.\n' +
        '  Sentence 4 (optional): Note any aggravating factors, such as the seniority of the signatory, the scale of the campaign, or the vulnerability of the target population.',
    ),

  missingInformation: z
    .array(z.string())
    .describe(
      'List of items that would strengthen this evidence but are absent ' +
        '(e.g. "Missing original URL", "No date visible", "Author not identified").',
    ),

  targetEntity: z
    .string()
    .describe(
      'The primary entity involved in this document. ' +
        'For Incriminating evidence: the entity responsible for the offence (e.g. "Ministry of Health", "Pfizer", "HMO"). ' +
        'For ContextAnchor evidence: the organisation that issued or published the document (e.g. "FDA", "WHO", "CDC"). ' +
        'Extract directly from the evidence; do not invent. If no entity can be identified, use "Unknown".',
    ),

  evidencePerspective: z
    .enum(['Internal Knowledge', 'Public Statement', 'Citizen Experience'])
    .describe(
      'The epistemic perspective of this evidence. Choose exactly one: ' +
        '"Internal Knowledge" — leaked memos, suppressed reports, hidden data, internal communications: what officials actually knew. ' +
        '"Public Statement" — press releases, TV interviews, official publications, government announcements: what the public was told. ' +
        '"Citizen Experience" — personal coercion, adverse events, employer mandates, ground-truth first-person accounts.',
    ),

  tierReasoning: z
    .string()
    .describe(
      'Chain-of-thought reasoning step — fill this BEFORE choosing evidenceTier. ' +
        'Write 1-2 sentences in highly professional Hebrew explaining exactly WHY this specific tier was chosen. ' +
        'Reference the tier definitions directly: ' +
        'Tier 1 requires internal/leaked documents proving deliberate wrongdoing; ' +
        'Tier 2 requires official documents, direct coercion letters, or official public statements; ' +
        'Tier 3 covers media articles or general patterns without direct proof; ' +
        'Tier 4 is hearsay, social media, or personal testimony without corroboration. ' +
        'Example: "מסמך זה מסווג כדרגה 1 מכיוון שמדובר במסמך פנימי דלוף המוכיח ידיעה מוקדמת על תופעות הלוואי, בניגוד לדרגה 2 שדורשת הצהרה רשמית פומבית בלבד."',
    ),

  evidenceTier: z
    .enum([
      'Tier 4: Anecdotal',
      'Tier 3: Supporting',
      'Tier 2: Material',
      'Tier 1: Smoking Gun',
    ])
    .describe(
      'Legal weight classification:\n' +
        '  Tier 4: Anecdotal   — Hearsay, social media posts, circumstantial. Low legal weight.\n' +
        '  Tier 3: Supporting  — Media articles, general patterns. Good for context but not definitive.\n' +
        '  Tier 2: Material    — Official documents, direct coercion letters, official public statements.\n' +
        '  Tier 1: Smoking Gun — Internal leaked documents, definitive proof of withholding info or explicit coercion.',
    ),

  keyFigures: z
    .array(z.string())
    .describe(
      'Extract ONLY the names of figures DIRECTLY INVOLVED, actively participating, or legally ' +
        'responsible for the events described in the evidence. ' +
        'Do NOT include background names, external politicians, or commentators cited merely for context ' +
        '(e.g., exclude Anthony Fauci or Albert Bourla if they are only mentioned in passing and bear ' +
        'no direct responsibility for the specific act described). ' +
        'ALL names MUST be transliterated or translated into Hebrew. ' +
        'CRITICAL — Titles and gershayim encoding: The Hebrew title "ד״ר" (Doctor) uses the gershayim ' +
        'character ״ (U+05F4), which looks like a double-quote. To avoid JSON encoding issues, ' +
        'write it as "דר\' " (with a plain apostrophe) or simply prefix the surname directly. ' +
        'Examples of correct output: "דר\' שרון אלרואי-פרייס", "פרופ\' מתי ברקוביץ\'", "אלברט בורלה". ' +
        'NEVER output a bare single letter or title without a full name (never output "ד" alone — ' +
        'if you see "ד״ר" in the text, the name that follows it MUST be included). ' +
        'If OCR is messy, reconstruct the full name logically from context. ' +
        'Return an empty array if no directly responsible figures are named.',
    ),

  medicalConditions: z
    .array(z.string())
    .describe(
      'Extract broad medical categories — group minor symptoms under their major systemic category ' +
        'to avoid tag clutter (e.g., group dizziness + headache under "פגיעות נוירולוגיות"; ' +
        'group irregular periods + spotting under "שיבושים במחזור החודשי"). ' +
        'ALL medical tags MUST be written in professional Hebrew ' +
        '(e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי", "קרישי דם"). ' +
        'Return an empty array if no medical conditions are mentioned.',
    ),

  evidenceDate: z
    .string()
    .describe(
      'The date the evidence was published, created, or occurred, strictly in YYYY-MM-DD format. ' +
        'Search the entire image/document for any temporal marker: document creation dates, ' +
        'article publication dates, official letterhead dates, email/chat timestamps, ' +
        'government report dates. Extract the most legally relevant date. ' +
        'If absolutely no date can be found, output "Unknown".',
    ),

  statisticalClaims: z
    .array(z.string())
    .describe(
      'Extract EXACT verbatim numerical or percentage claims about vaccine efficacy, safety, or ' +
        'trial results as they appear in the source (e.g., "יעיל ב-94% בקרב בני 55 ומעלה בשלב 3"). ' +
        'These are direct quotes — preserve the original source language verbatim. ' +
        'Return an empty array if no statistics are present.',
    ),

  regulatoryMentions: z
    .array(z.string())
    .describe(
      'Extract EXACT verbatim phrases describing regulatory approval status or legal classification ' +
        'as they appear in the source (e.g., "ביום חמישי צפוי להתקבל אישור מה-FDA"). ' +
        'These are direct quotes — preserve the original source language verbatim. ' +
        'Return an empty array if no regulatory language is present.',
    ),

  euaOmissionStatus: z
    .enum(['Omits EUA (Misleading)', 'Explicitly Mentions EUA', 'Not Applicable'])
    .describe(
      'DETERMINISTIC CHECK — do not infer, do not hallucinate. ' +
        'Step 1: Does the text discuss FDA approval, vaccine authorization, or regulatory clearance? ' +
        'If NO → output "Not Applicable". ' +
        'Step 2: Does the text EXPLICITLY use any of these terms: ' +
        '"Emergency Use Authorization", "EUA", "אישור חירום", "אישור שימוש חירום"? ' +
        'If YES → output "Explicitly Mentions EUA". ' +
        'If NO → output "Omits EUA (Misleading)". ' +
        'This is a strict binary check on the text as written — ' +
        '"Omits EUA (Misleading)" means the approval was discussed but the EUA qualifier was absent.',
    ),

  rejectionReason: z
    .string()
    .optional()
    .describe(
      'Populated ONLY when isRelevant is false. ' +
        'A single polite sentence in highly professional Hebrew explaining exactly why this ' +
        'submission was rejected — e.g. what specific threshold it failed to meet. ' +
        'Must be undefined (omitted) when isRelevant is true.',
    ),
});

export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;

// ---------------------------------------------------------------------------
// Schema integrity guard — runs at module load (server startup).
//
// Validates that every field in IntakeOutputSchema survives LangChain's
// Zod → JSON Schema conversion. If a field is silently dropped — for example
// because a Zod v4 construct (ZodPipe from .transform()/.pipe()) is used that
// the converter cannot handle — the model will never see that field in its
// function-calling schema. Every subsequent Zod parse will then fail with a
// cryptic validation error that is very hard to trace back here.
//
// Failing loudly at startup is far better than failing silently mid-request.
// If this throws, apply the transformation post-parse in analyzeEvidence /
// analyzeText instead of inside the schema definition.
// ---------------------------------------------------------------------------

function assertIntakeSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(IntakeOutputSchema) as { properties?: Record<string, unknown> };
  const schemaFields = Object.keys(IntakeOutputSchema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));

  if (missing.length > 0) {
    throw new Error(
      `[IntakeAgent] Schema compatibility failure: the following fields were dropped by ` +
      `LangChain's zodToJsonSchema and will be absent from the function-calling schema — ` +
      `[${missing.join(', ')}]. ` +
      `Apply any transformations post-parse in analyzeEvidence/analyzeText instead.`,
    );
  }
}

// Executed once at module load — fails before any request is processed.
assertIntakeSchemaCompatibility();

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies. Analyze this document (evidence). Extract the text and intent.

**STEP 1 — Determine evidenceRole FIRST (before all other fields):**
- "Incriminating": the document shows a state or corporate actor concealing, coercing, or misleading. This covers THREE forms:
  (a) **Explicit concealment** — leaked memos, suppressed reports, internal adverse-event data withheld from regulators or the public.
  (b) **Direct coercion** — employer mandates, written threats, penalties for refusal to vaccinate.
  (c) **Soft coercion via influence campaigns** — an official document describing a coordinated strategy to deploy celebrities, public figures, social proof, or institutional authority to drive uptake of an experimental/EUA medical procedure, particularly when the campaign design contains no instruction to disclose EUA or experimental status to recipients. Substituting social pressure for informed consent is legally a form of coercion even without a direct threat. The document does NOT need to be leaked — the strategy it describes is the incriminating element.
- "ContextAnchor": a neutral document that establishes a verifiable fact or date used as a measurement baseline (e.g. an FDA press release announcing approval dates, a WHO guideline, a peer-reviewed scientific publication). The issuing entity is NOT the defendant — the document is objective evidence of what was publicly known at a specific time.

**CRITICAL DISAMBIGUATION — official ≠ neutral:** An official government document is NOT automatically a ContextAnchor. Ask: "Does this document describe a deliberate strategy, campaign, or plan by a state/corporate actor?" If YES, evaluate for Incriminating. A government policy letter planning a celebrity recruitment drive for a vaccine is evidence of strategic intent, not a neutral fact record.

The three primary legal theories of liability (for Incriminating evidence):
1. **Side Effect Withholding** — Deliberate suppression or delayed disclosure of adverse event data.
2. **Regulatory Misleading** — False or misleading representations to regulators (e.g. FDA approval process, efficacy claims).
3. **Coercion** — Undue pressure used to compel vaccination without true informed consent. Includes BOTH direct coercion (employer mandates, written threats, loss of employment) AND soft/indirect coercion (organised influence campaigns using celebrities, social proof, or authority figures that bypass informed consent by design — especially when EUA/experimental status is not disclosed in the campaign strategy).

Your task is to classify the evidence strictly according to the provided JSON schema. You must:
- Be objective and evidence-based.
- Never invent facts, laws, or citations not present in the submitted content.
- Set isRelevant: true for BOTH Incriminating evidence AND ContextAnchor documents that establish a factual baseline relevant to the case. Set isRelevant: false ONLY for content with zero legal value.
- Set category to "Factual Baseline" when evidenceRole is "ContextAnchor". For Incriminating evidence, choose the appropriate offense category.
- For targetEntity: for ContextAnchor, use the issuing organisation (e.g. "FDA", "WHO"). For Incriminating, use the entity responsible for the offence. Use "Unknown" if unidentifiable.
- For evidencePerspective, classify the EPISTEMIC NATURE of the document: "Internal Knowledge" if this is a leaked/internal document showing what officials actually knew; "Public Statement" if this is an official announcement, press release, or public communication; "Citizen Experience" if this is a personal testimony of coercion or adverse events.
- CRITICAL — Tier assignment (Chain of Thought): You MUST populate tierReasoning BEFORE choosing evidenceTier. In tierReasoning, reason step-by-step in professional Hebrew: (1) Is this an internal/leaked document proving deliberate wrongdoing? → Tier 1. (2) Is this an official document, direct coercion letter, or official public statement? → Tier 2. (3) Is this a media article or general pattern without direct proof? → Tier 3. (4) Is this hearsay, social media, or uncorroborated testimony? → Tier 4. Then set evidenceTier to match your reasoning. This two-step process ensures consistent tier grading across PDF and URL submissions.
- For keyFigures, extract ONLY the names of individuals DIRECTLY RESPONSIBLE for or actively participating in the offence described. Do NOT include figures merely referenced for context. Transliterate all names into Hebrew. CRITICAL — gershayim encoding: The Hebrew character ״ (gershayim, U+05F4) used in titles like "ד״ר" looks like a double-quote and can corrupt JSON strings. Instead, write Doctor as "דר' " and Professor as "פרופ'" (plain apostrophe). Example: "דר' שרון אלרואי-פרייס", "פרופ' מתי ברקוביץ'". NEVER output a bare letter ("ד") — if you see a title in the text, the full name that follows it MUST be included. If OCR is messy, reconstruct the full name from context. Return an empty array if none qualify.
- For medicalConditions, group symptoms under their major systemic Hebrew category to avoid clutter (e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי"). ALL medical tags MUST be in professional Hebrew. Return an empty array if none are mentioned.
- For statisticalClaims, extract EXACT verbatim numerical or percentage claims about vaccine efficacy, safety, or trial results as they appear in the source (e.g., "יעיל ב-94% בקרב בני 55 ומעלה"). These are direct quotes — preserve the original source language verbatim. Return an empty array if no statistics are present.
- For regulatoryMentions, extract EXACT verbatim phrases describing regulatory approval status or legal classification as they appear in the source (e.g., "ביום חמישי צפוי להתקבל אישור מה-FDA"). These are direct quotes — preserve the original source language verbatim. Return an empty array if no regulatory language is present.
- For euaOmissionStatus, perform a two-step check: (1) Does the text discuss vaccine approval/authorization OR describe a public promotion/persuasion campaign for the vaccine? If NO to both → "Not Applicable". (2) Does it EXPLICITLY use "Emergency Use Authorization", "EUA", "אישור חירום", or "אישור שימוש חירום"? If YES → "Explicitly Mentions EUA". If NO → "Omits EUA (Misleading)". NOTE: A vaccination promotion or celebrity-recruitment campaign document that contains no instruction to disclose EUA/experimental status counts as an EUA omission — the absence of the disclosure requirement in the strategy itself is the omission.
- For evidenceDate, scan the ENTIRE image/document for any date — letterhead dates, publication dates, email timestamps, article bylines, official report dates, chat message timestamps. Output the most legally relevant date in strict YYYY-MM-DD format. If no date is visible anywhere, output "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: ALL output strings (summary, missingInformation, rejectionReason, tierReasoning, keyFigures, medicalConditions) MUST be written in highly professional Hebrew (עברית משפטית מקצועית). statisticalClaims and regulatoryMentions extract VERBATIM quotes from the source — preserve the source language as-is. The evidenceRole, category, evidenceTier, evidencePerspective, and evidenceDate fields must remain in English for database consistency.
- CRITICAL — GLOBAL gershayim rule (applies to ALL Hebrew string fields, not just keyFigures): The Hebrew character ״ (gershayim, U+05F4) looks identical to a double-quote and WILL corrupt the JSON output by prematurely closing any string. NEVER use ״ anywhere in your output. Replace it with a plain apostrophe (') in all contexts: "ד״ר" → "דר'", "פרופ״ר" → "פרופ'", "מנכ״ל" → "מנכ'ל", "סמנכ״ל" → "סמנכ'ל". This applies inside summary, tierReasoning, missingInformation, rejectionReason, and every other string field.

**REJECTION CRITERIA — You MUST set isRelevant: false AND populate rejectionReason in Hebrew if ANY of the following apply:**
1. The content is an opinion piece, editorial, or political argument that makes no specific, verifiable factual claim — AND it is not a neutral official factual document usable as a timeline anchor.
2. The content is a general social media post, rant, or personal grievance without concrete documentation of wrongdoing by a named entity.
3. The content is completely unrelated to Covid-19 policies, vaccine side effects, coercion, or regulatory conduct.
4. The content has zero factual evidentiary value that could be presented in a court of law (e.g. memes, satire, unrelated news, restaurant reviews, sports articles).

**EXCEPTION for Tier 4 — Personal Testimony:**
- ACCEPT a personal testimony ONLY IF the person describes a SPECIFIC direct physical injury (e.g. "I developed myocarditis 3 days after my second dose, confirmed by hospital records") or a SPECIFIC direct employer coercion they personally experienced (e.g. "My manager sent me a written letter threatening dismissal if I refused vaccination").
- REJECT vague statements like "the government lied to us", general protest slogans, or political opinions.

**CRITICAL: Never force irrelevant content into a category to avoid rejection. A strict, honest rejection with a clear rejectionReason is far more valuable to the legal team than a fabricated classification.**`;

const SYSTEM_PROMPT_TEXT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies. Analyze the following web article / text document (evidence). The text has been extracted from a web page and is provided as plain text.

**STEP 1 — Determine evidenceRole FIRST (before all other fields):**
- "Incriminating": the document shows a state or corporate actor concealing, coercing, or misleading. This covers THREE forms:
  (a) **Explicit concealment** — leaked memos, suppressed reports, internal adverse-event data withheld from regulators or the public.
  (b) **Direct coercion** — employer mandates, written threats, penalties for refusal to vaccinate.
  (c) **Soft coercion via influence campaigns** — an official document describing a coordinated strategy to deploy celebrities, public figures, social proof, or institutional authority to drive uptake of an experimental/EUA medical procedure, particularly when the campaign design contains no instruction to disclose EUA or experimental status to recipients. Substituting social pressure for informed consent is legally a form of coercion even without a direct threat. The document does NOT need to be leaked — the strategy it describes is the incriminating element.
- "ContextAnchor": a neutral document that establishes a verifiable fact or date used as a measurement baseline (e.g. an FDA press release announcing approval dates, a WHO guideline, a peer-reviewed scientific publication). The issuing entity is NOT the defendant — the document is objective evidence of what was publicly known at a specific time.

**CRITICAL DISAMBIGUATION — official ≠ neutral:** An official government document is NOT automatically a ContextAnchor. Ask: "Does this document describe a deliberate strategy, campaign, or plan by a state/corporate actor?" If YES, evaluate for Incriminating. A government policy letter planning a celebrity recruitment drive for a vaccine is evidence of strategic intent, not a neutral fact record.

The three primary legal theories of liability (for Incriminating evidence):
1. **Side Effect Withholding** — Deliberate suppression or delayed disclosure of adverse event data.
2. **Regulatory Misleading** — False or misleading representations to regulators (e.g. FDA approval process, efficacy claims).
3. **Coercion** — Undue pressure used to compel vaccination without true informed consent. Includes BOTH direct coercion (employer mandates, written threats, loss of employment) AND soft/indirect coercion (organised influence campaigns using celebrities, social proof, or authority figures that bypass informed consent by design — especially when EUA/experimental status is not disclosed in the campaign strategy).

Your task is to classify the evidence strictly according to the provided JSON schema. You must:
- Be objective and evidence-based.
- Never invent facts, laws, or citations not present in the submitted content.
- Set isRelevant: true for BOTH Incriminating evidence AND ContextAnchor documents that establish a factual baseline relevant to the case. Set isRelevant: false ONLY for content with zero legal value.
- Set category to "Factual Baseline" when evidenceRole is "ContextAnchor". For Incriminating evidence, choose the appropriate offense category.
- For targetEntity: for ContextAnchor, use the issuing organisation (e.g. "FDA", "WHO"). For Incriminating, use the entity responsible for the offence. Use "Unknown" if unidentifiable.
- For evidencePerspective, classify the EPISTEMIC NATURE of the document: "Internal Knowledge" if this is a leaked/internal document showing what officials actually knew; "Public Statement" if this is an official announcement, press release, or public communication; "Citizen Experience" if this is a personal testimony of coercion or adverse events.
- CRITICAL — Tier assignment (Chain of Thought): You MUST populate tierReasoning BEFORE choosing evidenceTier. In tierReasoning, reason step-by-step in professional Hebrew: (1) Is this an internal/leaked document proving deliberate wrongdoing? → Tier 1. (2) Is this an official document, direct coercion letter, or official public statement? → Tier 2. (3) Is this a media article or general pattern without direct proof? → Tier 3. (4) Is this hearsay, social media, or uncorroborated testimony? → Tier 4. Then set evidenceTier to match your reasoning. This two-step process ensures consistent tier grading across PDF and URL submissions.
- For keyFigures, extract ONLY the names of individuals DIRECTLY RESPONSIBLE for or actively participating in the offence described. Do NOT include figures merely referenced for context. Transliterate all names into Hebrew. CRITICAL — gershayim encoding: The Hebrew character ״ (gershayim, U+05F4) used in titles like "ד״ר" looks like a double-quote and can corrupt JSON strings. Instead, write Doctor as "דר' " and Professor as "פרופ'" (plain apostrophe). Example: "דר' שרון אלרואי-פרייס", "פרופ' מתי ברקוביץ'". NEVER output a bare letter ("ד") — if you see a title in the text, the full name that follows it MUST be included. If OCR is messy, reconstruct the full name from context. Return an empty array if none qualify.
- For medicalConditions, group symptoms under their major systemic Hebrew category to avoid clutter (e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי"). ALL medical tags MUST be in professional Hebrew. Return an empty array if none are mentioned.
- For statisticalClaims, extract EXACT verbatim numerical or percentage claims about vaccine efficacy, safety, or trial results as they appear in the source (e.g., "יעיל ב-94% בקרב בני 55 ומעלה"). These are direct quotes — preserve the original source language verbatim. Return an empty array if no statistics are present.
- For regulatoryMentions, extract EXACT verbatim phrases describing regulatory approval status or legal classification as they appear in the source (e.g., "ביום חמישי צפוי להתקבל אישור מה-FDA"). These are direct quotes — preserve the original source language verbatim. Return an empty array if no regulatory language is present.
- For euaOmissionStatus, perform a two-step check: (1) Does the text discuss vaccine approval/authorization OR describe a public promotion/persuasion campaign for the vaccine? If NO to both → "Not Applicable". (2) Does it EXPLICITLY use "Emergency Use Authorization", "EUA", "אישור חירום", or "אישור שימוש חירום"? If YES → "Explicitly Mentions EUA". If NO → "Omits EUA (Misleading)". NOTE: A vaccination promotion or celebrity-recruitment campaign document that contains no instruction to disclose EUA/experimental status counts as an EUA omission — the absence of the disclosure requirement in the strategy itself is the omission.
- For evidenceDate, scan the text for any date — article publication dates, bylines, official report dates. Output the most legally relevant date in strict YYYY-MM-DD format. If no date is visible, output "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: ALL output strings (summary, missingInformation, rejectionReason, tierReasoning, keyFigures, medicalConditions) MUST be written in highly professional Hebrew (עברית משפטית מקצועית). statisticalClaims and regulatoryMentions extract VERBATIM quotes from the source — preserve the source language as-is. The evidenceRole, category, evidenceTier, evidencePerspective, and evidenceDate fields must remain in English for database consistency.
- CRITICAL — GLOBAL gershayim rule (applies to ALL Hebrew string fields, not just keyFigures): The Hebrew character ״ (gershayim, U+05F4) looks identical to a double-quote and WILL corrupt the JSON output by prematurely closing any string. NEVER use ״ anywhere in your output. Replace it with a plain apostrophe (') in all contexts: "ד״ר" → "דר'", "פרופ״ר" → "פרופ'", "מנכ״ל" → "מנכ'ל", "סמנכ״ל" → "סמנכ'ל". This applies inside summary, tierReasoning, missingInformation, rejectionReason, and every other string field.

**REJECTION CRITERIA — You MUST set isRelevant: false AND populate rejectionReason in Hebrew if ANY of the following apply:**
1. The content is an opinion piece, editorial, or political argument that makes no specific, verifiable factual claim — AND it is not a neutral official factual document usable as a timeline anchor.
2. The content is a general social media post, rant, or personal grievance without concrete documentation of wrongdoing by a named entity.
3. The content is completely unrelated to Covid-19 policies, vaccine side effects, coercion, or regulatory conduct.
4. The content has zero factual evidentiary value that could be presented in a court of law (e.g. memes, satire, unrelated news, restaurant reviews, sports articles).

**EXCEPTION for Tier 4 — Personal Testimony:**
- ACCEPT a personal testimony ONLY IF the person describes a SPECIFIC direct physical injury (e.g. "I developed myocarditis 3 days after my second dose, confirmed by hospital records") or a SPECIFIC direct employer coercion they personally experienced (e.g. "My manager sent me a written letter threatening dismissal if I refused vaccination").
- REJECT vague statements like "the government lied to us", general protest slogans, or political opinions.

**CRITICAL: Never force irrelevant content into a category to avoid rejection. A strict, honest rejection with a clear rejectionReason is far more valuable to the legal team than a fabricated classification.**`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the content block for the vision call.
 *
 * Gemini (default): both images and PDFs use the image_url data-URI format,
 * which LangChain's Google GenAI adapter converts to inline-data blobs.
 *
 * Anthropic fallback: PDFs require Anthropic's native document block; images
 * still use image_url.
 */
function buildFileContentBlock(base64: string, mimeType: string) {
  const provider = (process.env['INTAKE_PROVIDER'] ?? 'gemini').toLowerCase().trim();

  if (mimeType === 'application/pdf' && provider === 'anthropic') {
    return {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: base64,
      },
    };
  }

  // Works for images (all providers) and PDFs (Gemini)
  return {
    type: 'image_url' as const,
    image_url: { url: `data:${mimeType};base64,${base64}` },
  };
}

// ---------------------------------------------------------------------------
// IntakeAgent
// ---------------------------------------------------------------------------

export class IntakeAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('INTAKE', { temperature: 0 });
    this.chain = model.withStructuredOutput(IntakeOutputSchema, {
      name: 'intake_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * Analyse an evidence file and return a validated, typed analysis.
   *
   * Passes the file directly to Claude Vision with a combined legal analyst
   * system prompt. Returns a draft IntakeOutput — no hashing, blockchain,
   * or vector-store writes occur here.
   *
   * @param fileBuffer  Raw bytes of the uploaded file.
   * @param mimeType    MIME type of the file (image/jpeg, image/png, application/pdf).
   */
  async analyzeEvidence(fileBuffer: Buffer, mimeType: string): Promise<IntakeOutput> {
    const base64 = fileBuffer.toString('base64');
    const fileBlock = buildFileContentBlock(base64, mimeType);

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content: [
          fileBlock,
          { type: 'text' as const, text: 'Analyze this evidence document.' },
        ],
      },
    ];

    const result = await this.chain.invoke(messages);
    const parsed = IntakeOutputSchema.parse(result);
    // Filter gershayim-corrupted single-char artifacts (Zod v4 .transform() is
    // incompatible with LangChain's zodToJsonSchema — apply filtering here instead)
    parsed.keyFigures = parsed.keyFigures.filter((n) => n.trim().length > 3);
    return parsed;
  }

  /**
   * Analyse plain-text evidence scraped from a web URL.
   *
   * Used by the URL intake flow. The text has already been extracted from HTML
   * by Readability — no vision call is needed.
   *
   * @param text       Cleaned article body text.
   * @param sourceUrl  Original URL, included as provenance context in the prompt.
   */
  async analyzeText(text: string, sourceUrl: string): Promise<IntakeOutput> {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT_TEXT },
      {
        role: 'human' as const,
        content: [
          {
            type: 'text' as const,
            text: `Source URL: ${sourceUrl}\n\n---\n\n${text.slice(0, 40_000)}`,
          },
          { type: 'text' as const, text: 'Analyze this evidence document.' },
        ],
      },
    ];

    const result = await this.chain.invoke(messages);
    const parsed = IntakeOutputSchema.parse(result);
    parsed.keyFigures = parsed.keyFigures.filter((n) => n.trim().length > 3);
    return parsed;
  }
}
