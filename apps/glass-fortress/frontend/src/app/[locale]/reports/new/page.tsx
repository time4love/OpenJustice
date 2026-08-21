'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { apiUrl } from '@/lib/api';
import { sendMagicLink } from '@/lib/supabase';
import {
  useEnumValues,
  useEnumLabel,
  ONCOLOGIC,
  NEUROCOGNITIVE_PVS,
  type EnumNamespace,
  type EnumValue,
  type MedicalSymptomCategory,
  type MedicalSeriousness,
  type CancerPresentationType,
  type CancerCourse,
  type CancerType,
  type CognitiveSymptomType,
  type SymptomPersistence,
  type MedicalCareEngagement,
  type VaccineManufacturer,
  type ReportTimingWindow,
  type SocialEconomicImpactCategory,
  type FormalBasisAsserted,
  type ConsequenceSeverity,
  type SocialOutcomeStatus,
  type ReporterAgeRange,
  type ReporterGender,
  type VaccinationStatus,
  type ReportCalendarPeriod,
  type EmploymentSector,
  type RemedyPursued,
  type RelationshipAffected,
  EMPLOYMENT_CATEGORIES,
  FORMAL_PROCESS_CATEGORIES,
  RELATIONAL_CATEGORIES,
  RELIGIOUS_ACCOMMODATION_DENIED,
} from '@/lib/reportEnums';

// ---------------------------------------------------------------------------
// Public adverse-outcome self-report intake.
//
// Verification comes FIRST, before a single question is answered, and this
// page is its own magic-link callback — the two facts are one design, not
// two. See docs/gf-adverse-event-report-schema-dev-plan.md §5 Phase 8 for
// the alternatives that were weighed and dropped; the short version:
//
//   - The backend burns the reporter's Supabase account the moment it
//     verifies the token (§2.8), so verification cannot happen until the
//     reporter is ready to submit, and cannot be retried without a fresh
//     email round trip.
//   - A magic link is a full page navigation, so anything answered before
//     clicking it would have to survive in browser storage. That storage
//     would hold health data (GDPR Art. 9) with no submission to justify
//     it, at exactly the moment the reporter has walked away to their
//     inbox. Verifying first means there is nothing to persist: the only
//     thing that has to cross the round trip is the token, and it arrives
//     in the URL by construction.
//   - /auth/callback is not reusable here — it calls AuthContext.login(),
//     which establishes a persistent Researcher session and would clobber a
//     signed-in researcher's own. This flow deliberately never touches
//     AuthContext: the token lives in component state, is used once, and
//     dies with the page.
//
// The magic link's redirect_to must be in the Supabase project's Auth
// redirect allow-list; GoTrue silently falls back to SITE_URL for one it
// does not recognise, so a missing entry looks like "the link works but
// lands on the homepage" rather than an error. Verified already satisfied
// on staging (both locale prefixes) — see the dev plan §5 Phase 8 for the
// read-only probe that checks this without sending an email.
// ---------------------------------------------------------------------------

type Domain = 'MEDICAL' | 'SOCIAL_ECONOMIC';
type Step = 'verify' | 'sent' | 'domain' | 'category' | 'details' | 'about' | 'review' | 'done';

const WIZARD_STEPS = ['verify', 'domain', 'category', 'details', 'about', 'review'] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/** Which progress dot a given step lights up ('sent' is still verifying). */
const STEP_PROGRESS: Record<Step, WizardStep | null> = {
  verify: 'verify',
  sent: 'verify',
  domain: 'domain',
  category: 'category',
  details: 'details',
  about: 'about',
  review: 'review',
  done: null,
};

interface MedicalAnswers {
  symptomCategory?: MedicalSymptomCategory;
  seriousness: MedicalSeriousness;
  cancerPresentationType?: CancerPresentationType;
  cancerCourse?: CancerCourse;
  cancerAtypicalFeatures?: boolean;
  cancerType?: CancerType;
  cognitiveSymptomType?: CognitiveSymptomType;
  postExertionalMalaise?: boolean;
  symptomPersistence: SymptomPersistence;
  vaccineManufacturer: VaccineManufacturer;
  doseNumber?: number;
  onsetWindow: ReportTimingWindow;
  medicalCareEngagement: MedicalCareEngagement;
  preExistingCondition?: boolean;
}

interface SocialAnswers {
  impactCategory?: SocialEconomicImpactCategory;
  formalBasisAsserted: FormalBasisAsserted;
  consequenceSeverity: ConsequenceSeverity;
  outcomeStatus: SocialOutcomeStatus;
  documentationAvailable?: boolean;
  // Undefined until answered on purpose: the intake schema requires this one,
  // so an unanswered form must fail the step rather than send a default that
  // would read as a deliberate "prefer not to say".
  vaccinationStatus?: VaccinationStatus;
  occurredDuring: ReportCalendarPeriod;
  // Conditional — required for their own categories, rejected for the rest.
  employmentSector?: EmploymentSector;
  remedyPursued?: RemedyPursued;
  relationshipAffected?: RelationshipAffected;
}

// Defaults mirror the Prisma column defaults and the intake zod schema's
// .default(...) calls exactly — the form starts where the database would.
const EMPTY_MEDICAL: MedicalAnswers = {
  seriousness: 'NONE',
  symptomPersistence: 'UNKNOWN',
  vaccineManufacturer: 'UNKNOWN',
  onsetWindow: 'UNKNOWN',
  medicalCareEngagement: 'UNKNOWN',
};

const EMPTY_SOCIAL: SocialAnswers = {
  formalBasisAsserted: 'UNKNOWN',
  consequenceSeverity: 'NONE',
  outcomeStatus: 'UNKNOWN',
  occurredDuring: 'UNKNOWN',
};

/**
 * Builds the medical payload from the answers, including the conditional
 * blocks only when their category is actually selected.
 *
 * The intake schema rejects a cancer field on a non-ONCOLOGIC report (and a
 * cognitive field on a non-NEUROCOGNITIVE_PVS one) — so a reporter who fills
 * in the cancer questions and then changes their mind about the category
 * would otherwise submit a body the server refuses. Deriving the payload
 * from the category at send time makes that state unrepresentable rather
 * than relying on remembering to clear it on every category change.
 */
/**
 * Same structural guarantee medicalPayload provides: a follow-up is included
 * only when its category applies. A reporter who answers the employment
 * questions and then switches to "family rupture" would otherwise submit a
 * body the schema refuses — and clearing state on every category change is the
 * kind of thing that works until someone adds a fourth cluster.
 */
function socialPayload(a: SocialAnswers): Record<string, unknown> {
  const category = a.impactCategory;
  return {
    impactCategory: category,
    formalBasisAsserted: a.formalBasisAsserted,
    consequenceSeverity: a.consequenceSeverity,
    outcomeStatus: a.outcomeStatus,
    documentationAvailable: a.documentationAvailable,
    vaccinationStatus: a.vaccinationStatus,
    occurredDuring: a.occurredDuring,
    ...(category && EMPLOYMENT_CATEGORIES.includes(category)
      ? { employmentSector: a.employmentSector }
      : {}),
    ...(category && FORMAL_PROCESS_CATEGORIES.includes(category)
      ? { remedyPursued: a.remedyPursued }
      : {}),
    ...(category && RELATIONAL_CATEGORIES.includes(category)
      ? { relationshipAffected: a.relationshipAffected }
      : {}),
  };
}

function medicalPayload(a: MedicalAnswers): Record<string, unknown> {
  const base = {
    symptomCategory: a.symptomCategory,
    seriousness: a.seriousness,
    symptomPersistence: a.symptomPersistence,
    vaccineManufacturer: a.vaccineManufacturer,
    doseNumber: a.doseNumber,
    onsetWindow: a.onsetWindow,
    medicalCareEngagement: a.medicalCareEngagement,
    preExistingCondition: a.preExistingCondition,
  };

  if (a.symptomCategory === ONCOLOGIC) {
    return {
      ...base,
      cancerPresentationType: a.cancerPresentationType,
      cancerCourse: a.cancerCourse,
      cancerAtypicalFeatures: a.cancerAtypicalFeatures,
      cancerType: a.cancerType,
    };
  }
  if (a.symptomCategory === NEUROCOGNITIVE_PVS) {
    return {
      ...base,
      cognitiveSymptomType: a.cognitiveSymptomType,
      postExertionalMalaise: a.postExertionalMalaise,
    };
  }
  return base;
}

/**
 * The conditional fields the intake schema requires — cancerType and
 * cancerCourse when the category is ONCOLOGIC, cognitiveSymptomType when it is
 * NEUROCOGNITIVE_PVS. Each has a real "don't know" option, so requiring an
 * answer never forces a guess.
 *
 * Mirrors reportIntakeSchemas.ts's superRefine deliberately: the server is
 * still the authority, but a reporter should find out they missed a required
 * answer while the answer is in front of them, not from a 400 after they
 * have moved on two steps.
 */
function missingRequiredSocialDetail(a: SocialAnswers): boolean {
  // vaccinationStatus decides whether the row reads as refusal-side or
  // vaccination-side harm, and the schema requires it without a default.
  if (a.vaccinationStatus === undefined) return true;

  // Each conditional follow-up is required for its own categories. Mirrors
  // socialEconomicImpactReportSchema's superRefine so the reporter is stopped
  // while the question is still in front of them, not by a 400 two steps later.
  const category = a.impactCategory;
  if (!category) return true;
  if (EMPLOYMENT_CATEGORIES.includes(category) && a.employmentSector === undefined) return true;
  if (FORMAL_PROCESS_CATEGORIES.includes(category) && a.remedyPursued === undefined) return true;
  if (RELATIONAL_CATEGORIES.includes(category) && a.relationshipAffected === undefined) return true;
  return false;
}

function missingRequiredDetail(a: MedicalAnswers): boolean {
  if (a.symptomCategory === ONCOLOGIC) {
    return a.cancerType === undefined || a.cancerCourse === undefined;
  }
  if (a.symptomCategory === NEUROCOGNITIVE_PVS) return a.cognitiveSymptomType === undefined;
  return false;
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function WhyWeAsk({ text }: { text: string }) {
  const t = useTranslations('reports.questions');
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-amber-700 hover:underline"
        aria-expanded={open}
      >
        {t('why')} {open ? '−' : '+'}
      </button>
      {open && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{text}</p>}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-800">{label}</label>
      {children}
      <WhyWeAsk text={help} />
    </div>
  );
}

/** A dropdown over one taxonomy enum, labelled from its message namespace. */
function EnumSelect<N extends EnumNamespace>({
  namespace,
  label,
  help,
  value,
  onChange,
  placeholder,
}: {
  namespace: N;
  label: string;
  help: string;
  value: EnumValue<N> | undefined;
  onChange: (v: EnumValue<N>) => void;
  placeholder?: string;
}) {
  const values = useEnumValues(namespace);
  const label_ = useEnumLabel(namespace);

  return (
    <Field label={label} help={help}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as EnumValue<N>)}
        className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
        {values.map((v) => (
          <option key={v} value={v}>{label_(v)}</option>
        ))}
      </select>
    </Field>
  );
}

/** The taxonomy choice that decides the rest of the form — every option visible. */
function EnumRadioList<N extends EnumNamespace>({
  namespace,
  value,
  onChange,
}: {
  namespace: N;
  value: EnumValue<N> | undefined;
  onChange: (v: EnumValue<N>) => void;
}) {
  const values = useEnumValues(namespace);
  const label = useEnumLabel(namespace);

  return (
    <div className="space-y-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`w-full text-start px-4 py-3 rounded-lg border text-sm transition-colors ${
            value === v
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
          }`}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );
}

/** Yes / No / not answered — the schema keeps these optional, so unanswered is a real state. */
function BooleanChoice({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const t = useTranslations('reports.questions');
  const options: { key: string; label: string; v: boolean | undefined }[] = [
    { key: 'yes', label: t('yes'), v: true },
    { key: 'no', label: t('no'), v: false },
    { key: 'unanswered', label: t('unanswered'), v: undefined },
  ];

  return (
    <Field label={label} help={help}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
              value === o.v
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Methodology — §4.1/§4.2 of the dev plan, the "why these categories" record.
// Collapsed by default: it is the answer to a question a sceptical reporter
// will ask, not something to make everyone read first.
// ---------------------------------------------------------------------------

function MethodologyPanel({ domain }: { domain: Domain | null }) {
  const t = useTranslations('reports.methodology');
  const [open, setOpen] = useState(false);

  const sections =
    domain === 'SOCIAL_ECONOMIC'
      ? (['socialEmployment', 'socialFamily'] as const)
      : domain === 'MEDICAL'
      ? (['medicalCategory', 'medicalCancer', 'medicalPersistence'] as const)
      : ([] as const);

  return (
    <div className="mt-8 border-t border-slate-200 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-slate-500 hover:text-slate-800"
        aria-expanded={open}
      >
        {t('toggle')} {open ? '−' : '+'}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">{t('intro')}</p>
          {sections.map((key) => (
            <div key={key}>
              <h3 className="text-xs font-semibold text-slate-700">{t(`${key}Heading`)}</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{t(key)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function StepProgress({ step }: { step: Step }) {
  const t = useTranslations('reports.steps');
  const active = STEP_PROGRESS[step];
  if (!active) return null;
  const activeIndex = WIZARD_STEPS.indexOf(active);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-slate-400">
      {WIZARD_STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={i === activeIndex ? 'text-slate-900 font-semibold' : i < activeIndex ? 'text-slate-500' : ''}>
            {t(s)}
          </span>
          {i < WIZARD_STEPS.length - 1 && <span aria-hidden="true">·</span>}
        </li>
      ))}
    </ol>
  );
}

function StepShell({
  step,
  heading,
  body,
  children,
  onBack,
}: {
  step: Step;
  heading: string;
  body?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const t = useTranslations('reports');

  return (
    <div className="space-y-5">
      <StepProgress step={step} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        {body && <p className="mt-2 text-sm text-slate-500 leading-relaxed">{body}</p>}
      </div>
      {children}
      {onBack && (
        <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-700">
          ← {t('backStep')}
        </button>
      )}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
  type = 'button',
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function VerifyStep({
  onSent,
  linkError,
}: {
  onSent: (email: string) => void;
  linkError: string | null;
}) {
  const t = useTranslations('reports.verify');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Back to this very page — it is its own callback (see file header).
      // The locale is explicit so a reporter who chose English is not
      // bounced to the default-locale copy of the form mid-flow.
      await sendMagicLink(email.trim(), `${window.location.origin}/${locale}/reports/new`);
      onSent(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sendFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepShell step="verify" heading={t('heading')} body={t('body')}>
      <ul className="space-y-2 text-sm text-slate-600">
        {(['point1', 'point2', 'point3'] as const).map((k) => (
          <li key={k} className="flex gap-2 leading-relaxed">
            <span aria-hidden="true" className="text-amber-600 shrink-0">•</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ul>

      {linkError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {linkError}
        </p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="reporter-email" className="block text-sm font-medium text-slate-700 mb-1">
            {t('emailLabel')}
          </label>
          <input
            id="reporter-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            dir="ltr"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <PrimaryButton type="submit" disabled={loading || !email.trim()}>
          {loading ? t('sending') : t('send')}
        </PrimaryButton>
      </form>

      <p className="text-xs text-slate-400 leading-relaxed">{t('whyFirst')}</p>
    </StepShell>
  );
}

function SentStep({ email, onRestart }: { email: string; onRestart: () => void }) {
  const t = useTranslations('reports.verify');

  return (
    <StepShell step="sent" heading={t('sentHeading')}>
      <p className="text-sm text-slate-600 leading-relaxed">{t('sentBody', { email })}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{t('sentHint')}</p>
      <button type="button" onClick={onRestart} className="text-xs text-slate-500 underline hover:text-slate-800">
        {t('tryAgain')}
      </button>
    </StepShell>
  );
}

function DomainStep({ onPick }: { onPick: (d: Domain) => void }) {
  const t = useTranslations('reports.domain');
  const options: { domain: Domain; title: string; body: string }[] = [
    { domain: 'MEDICAL', title: t('medicalTitle'), body: t('medicalBody') },
    { domain: 'SOCIAL_ECONOMIC', title: t('socialTitle'), body: t('socialBody') },
  ];

  return (
    <StepShell step="domain" heading={t('heading')} body={t('body')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((o) => (
          <button
            key={o.domain}
            type="button"
            onClick={() => onPick(o.domain)}
            className="text-start p-5 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-900 transition-colors"
          >
            <h2 className="text-base font-semibold text-slate-900">{o.title}</h2>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{o.body}</p>
          </button>
        ))}
      </div>
    </StepShell>
  );
}

function CategoryStep({
  domain,
  medical,
  social,
  setMedical,
  setSocial,
  onNext,
  onBack,
}: {
  domain: Domain;
  medical: MedicalAnswers;
  social: SocialAnswers;
  setMedical: (fn: (a: MedicalAnswers) => MedicalAnswers) => void;
  setSocial: (fn: (a: SocialAnswers) => SocialAnswers) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('reports.questions');
  const tm = useTranslations('reports.medical');
  const ts = useTranslations('reports.social');

  const isMedical = domain === 'MEDICAL';
  const label = isMedical ? tm('symptomCategory.label') : ts('impactCategory.label');
  const help = isMedical ? tm('symptomCategory.help') : ts('impactCategory.help');
  const chosen = isMedical ? medical.symptomCategory : social.impactCategory;

  return (
    <StepShell step="category" heading={t('categoryHeading')} body={help} onBack={onBack}>
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {isMedical ? (
        <EnumRadioList
          namespace="medicalSymptomCategories"
          value={medical.symptomCategory}
          onChange={(v) => setMedical((a) => ({ ...a, symptomCategory: v }))}
        />
      ) : (
        <EnumRadioList
          namespace="socialEconomicImpactCategories"
          value={social.impactCategory}
          onChange={(v) => setSocial((a) => ({ ...a, impactCategory: v }))}
        />
      )}
      <PrimaryButton onClick={onNext} disabled={!chosen}>
        {useTranslations('reports')('continue')}
      </PrimaryButton>
      <MethodologyPanel domain={domain} />
    </StepShell>
  );
}

function MedicalDetails({
  answers,
  setAnswers,
}: {
  answers: MedicalAnswers;
  setAnswers: (fn: (a: MedicalAnswers) => MedicalAnswers) => void;
}) {
  const t = useTranslations('reports.questions');
  const tm = useTranslations('reports.medical');

  return (
    <>
      {answers.symptomCategory === ONCOLOGIC && (
        <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {t('cancerSection')}
          </h2>
          <EnumSelect
            namespace="cancerTypes"
            label={tm('cancerType.label')}
            help={tm('cancerType.help')}
            value={answers.cancerType}
            onChange={(v) => setAnswers((a) => ({ ...a, cancerType: v }))}
            placeholder="—"
          />
          <EnumSelect
            namespace="cancerPresentationTypes"
            label={tm('cancerPresentationType.label')}
            help={tm('cancerPresentationType.help')}
            value={answers.cancerPresentationType}
            onChange={(v) => setAnswers((a) => ({ ...a, cancerPresentationType: v }))}
            placeholder="—"
          />
          <EnumSelect
            namespace="cancerCourses"
            label={tm('cancerCourse.label')}
            help={tm('cancerCourse.help')}
            value={answers.cancerCourse}
            onChange={(v) => setAnswers((a) => ({ ...a, cancerCourse: v }))}
            placeholder="—"
          />
          <BooleanChoice
            label={tm('cancerAtypicalFeatures.label')}
            help={tm('cancerAtypicalFeatures.help')}
            value={answers.cancerAtypicalFeatures}
            onChange={(v) => setAnswers((a) => ({ ...a, cancerAtypicalFeatures: v }))}
          />
        </section>
      )}

      {answers.symptomCategory === NEUROCOGNITIVE_PVS && (
        <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {t('cognitiveSection')}
          </h2>
          <EnumSelect
            namespace="cognitiveSymptomTypes"
            label={tm('cognitiveSymptomType.label')}
            help={tm('cognitiveSymptomType.help')}
            value={answers.cognitiveSymptomType}
            onChange={(v) => setAnswers((a) => ({ ...a, cognitiveSymptomType: v }))}
            placeholder="—"
          />
          <BooleanChoice
            label={tm('postExertionalMalaise.label')}
            help={tm('postExertionalMalaise.help')}
            value={answers.postExertionalMalaise}
            onChange={(v) => setAnswers((a) => ({ ...a, postExertionalMalaise: v }))}
          />
        </section>
      )}

      <EnumSelect
        namespace="symptomPersistence"
        label={tm('symptomPersistence.label')}
        help={tm('symptomPersistence.help')}
        value={answers.symptomPersistence}
        onChange={(v) => setAnswers((a) => ({ ...a, symptomPersistence: v }))}
      />
      <EnumSelect
        namespace="medicalSeriousness"
        label={tm('seriousness.label')}
        help={tm('seriousness.help')}
        value={answers.seriousness}
        onChange={(v) => setAnswers((a) => ({ ...a, seriousness: v }))}
      />
      <EnumSelect
        namespace="reportTimingWindows"
        label={tm('onsetWindow.label')}
        help={tm('onsetWindow.help')}
        value={answers.onsetWindow}
        onChange={(v) => setAnswers((a) => ({ ...a, onsetWindow: v }))}
      />
      <EnumSelect
        namespace="medicalCareEngagement"
        label={tm('medicalCareEngagement.label')}
        help={tm('medicalCareEngagement.help')}
        value={answers.medicalCareEngagement}
        onChange={(v) => setAnswers((a) => ({ ...a, medicalCareEngagement: v }))}
      />
      <EnumSelect
        namespace="vaccineManufacturers"
        label={tm('vaccineManufacturer.label')}
        help={tm('vaccineManufacturer.help')}
        value={answers.vaccineManufacturer}
        onChange={(v) => setAnswers((a) => ({ ...a, vaccineManufacturer: v }))}
      />
      <Field label={tm('doseNumber.label')} help={tm('doseNumber.help')}>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={answers.doseNumber ?? ''}
          placeholder={t('dosePlaceholder')}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            setAnswers((a) => ({
              ...a,
              doseNumber: Number.isInteger(parsed) && parsed > 0 ? parsed : undefined,
            }));
          }}
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </Field>
      <BooleanChoice
        label={tm('preExistingCondition.label')}
        help={tm('preExistingCondition.help')}
        value={answers.preExistingCondition}
        onChange={(v) => setAnswers((a) => ({ ...a, preExistingCondition: v }))}
      />
    </>
  );
}

function SocialDetails({
  answers,
  setAnswers,
}: {
  answers: SocialAnswers;
  setAnswers: (fn: (a: SocialAnswers) => SocialAnswers) => void;
}) {
  const t = useTranslations('reports.questions');
  const ts = useTranslations('reports.social');
  const category = answers.impactCategory;
  const isEmployment = !!category && EMPLOYMENT_CATEGORIES.includes(category);
  const isFormalProcess = !!category && FORMAL_PROCESS_CATEGORIES.includes(category);
  const isRelational = !!category && RELATIONAL_CATEGORIES.includes(category);

  return (
    <>
      {/* First, and visually set apart: every answer below is read through it.
          A consequence of refusing and a consequence of having been vaccinated
          are opposite claims that otherwise produce identical rows. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <EnumSelect
          namespace="vaccinationStatuses"
          label={ts('vaccinationStatus.label')}
          help={ts('vaccinationStatus.help')}
          value={answers.vaccinationStatus}
          onChange={(v) => setAnswers((a) => ({ ...a, vaccinationStatus: v }))}
          placeholder="—"
        />
      </div>
      {(isEmployment || isFormalProcess) && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('employmentSection')}
          </h2>
          {isEmployment && (
            <EnumSelect
              namespace="employmentSectors"
              label={ts('employmentSector.label')}
              help={ts('employmentSector.help')}
              value={answers.employmentSector}
              onChange={(v) => setAnswers((a) => ({ ...a, employmentSector: v }))}
              placeholder="—"
            />
          )}
          {isFormalProcess && (
            <EnumSelect
              namespace="remediesPursued"
              label={ts('remedyPursued.label')}
              help={ts('remedyPursued.help')}
              value={answers.remedyPursued}
              onChange={(v) => setAnswers((a) => ({ ...a, remedyPursued: v }))}
              placeholder="—"
            />
          )}
        </section>
      )}

      {isRelational && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('relationalSection')}
          </h2>
          <EnumSelect
            namespace="relationshipsAffected"
            label={ts('relationshipAffected.label')}
            help={ts('relationshipAffected.help')}
            value={answers.relationshipAffected}
            onChange={(v) => setAnswers((a) => ({ ...a, relationshipAffected: v }))}
            placeholder="—"
          />
        </section>
      )}

      <EnumSelect
        namespace="formalBasisAsserted"
        label={ts('formalBasisAsserted.label')}
        help={ts('formalBasisAsserted.help')}
        value={answers.formalBasisAsserted}
        onChange={(v) => setAnswers((a) => ({ ...a, formalBasisAsserted: v }))}
      />
      <EnumSelect
        namespace="consequenceSeverity"
        label={ts('consequenceSeverity.label')}
        help={ts('consequenceSeverity.help')}
        value={answers.consequenceSeverity}
        onChange={(v) => setAnswers((a) => ({ ...a, consequenceSeverity: v }))}
      />
      <EnumSelect
        namespace="socialOutcomeStatus"
        label={ts('outcomeStatus.label')}
        help={ts('outcomeStatus.help')}
        value={answers.outcomeStatus}
        onChange={(v) => setAnswers((a) => ({ ...a, outcomeStatus: v }))}
      />
      <EnumSelect
        namespace="reportCalendarPeriods"
        label={ts('occurredDuring.label')}
        help={ts('occurredDuring.help')}
        value={answers.occurredDuring}
        onChange={(v) => setAnswers((a) => ({ ...a, occurredDuring: v }))}
      />
      <BooleanChoice
        label={ts('documentationAvailable.label')}
        help={ts('documentationAvailable.help')}
        value={answers.documentationAvailable}
        onChange={(v) => setAnswers((a) => ({ ...a, documentationAvailable: v }))}
      />
    </>
  );
}

function AboutStep({
  ageRange,
  gender,
  setAgeRange,
  setGender,
  onNext,
  onBack,
}: {
  ageRange: ReporterAgeRange;
  gender: ReporterGender;
  setAgeRange: (v: ReporterAgeRange) => void;
  setGender: (v: ReporterGender) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('reports.about');
  const tr = useTranslations('reports');

  return (
    <StepShell step="about" heading={t('heading')} body={t('body')} onBack={onBack}>
      <EnumSelect
        namespace="reporterAgeRanges"
        label={t('ageLabel')}
        help={t('skipHint')}
        value={ageRange}
        onChange={setAgeRange}
      />
      <EnumSelect
        namespace="reporterGenders"
        label={t('genderLabel')}
        help={t('skipHint')}
        value={gender}
        onChange={setGender}
      />
      <PrimaryButton onClick={onNext}>{tr('continue')}</PrimaryButton>
    </StepShell>
  );
}

/**
 * One recorded field — or nothing at all.
 *
 * The review step lists what will actually be stored, so a question the
 * reporter never answered has no place on it. Two values mean "no information"
 * and are dropped here rather than at each call site:
 *
 *   undefined   a follow-up this category never asked, or a yes/no left blank
 *   hideWhen    the value the field starts at, i.e. one the reporter never moved
 *
 * hideWhen is per-field rather than a blanket 'UNKNOWN' because the same member
 * means opposite things on different fields. consequenceSeverity starts at
 * 'NONE', so a NONE there is an untouched default and carries no information —
 * while remedyPursued has no default and is required when asked, so its 'NONE'
 * is a reporter actively saying "I took no action", which must stay visible.
 * A single global rule would either hide the second or show the first.
 *
 * Deliberately never dropped: 'UNDISCLOSED' on vaccinationStatus. It is
 * required, so it can only appear by explicit choice, and "prefer not to say"
 * is exactly the kind of answer a reporter deserves to see recorded.
 */
function ReviewRow<N extends EnumNamespace>({
  label,
  namespace,
  value,
  hideWhen = 'UNKNOWN',
}: {
  label: string;
  namespace: N;
  value: EnumValue<N> | undefined;
  hideWhen?: string;
}) {
  const valueLabel = useEnumLabel(namespace);
  if (value === undefined || value === hideWhen) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-900 text-end">{valueLabel(value)}</span>
    </div>
  );
}

function ReviewBooleanRow({ label, value }: { label: string; value: boolean | undefined }) {
  const t = useTranslations('reports.questions');
  if (value === undefined) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-900 text-end">{value ? t('yes') : t('no')}</span>
    </div>
  );
}

/** A plain non-enum row, hidden when there is nothing to show. */
function ReviewValueRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-900 text-end">{value}</span>
    </div>
  );
}

function ReviewStep({
  domain,
  medical,
  social,
  ageRange,
  gender,
  consent,
  setConsent,
  declaration,
  setDeclaration,
  submitting,
  submitError,
  onSubmit,
  onBack,
}: {
  domain: Domain;
  medical: MedicalAnswers;
  social: SocialAnswers;
  ageRange: ReporterAgeRange;
  gender: ReporterGender;
  consent: boolean;
  setConsent: (v: boolean) => void;
  declaration: boolean;
  setDeclaration: (v: boolean) => void;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('reports.review');
  const ta = useTranslations('reports.about');
  const tm = useTranslations('reports.medical');
  const ts = useTranslations('reports.social');
  const isMedical = domain === 'MEDICAL';

  return (
    <StepShell step="review" heading={t('heading')} body={t('body')} onBack={onBack}>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          {isMedical ? t('medicalTitle') : t('socialTitle')}
        </h2>

        {isMedical && medical.symptomCategory && (
          <>
            <ReviewRow label={tm('symptomCategory.label')} namespace="medicalSymptomCategories" value={medical.symptomCategory} />
            {medical.symptomCategory === ONCOLOGIC && (
              <>
                <ReviewRow label={tm('cancerType.label')} namespace="cancerTypes" value={medical.cancerType} />
                <ReviewRow label={tm('cancerPresentationType.label')} namespace="cancerPresentationTypes" value={medical.cancerPresentationType} />
                <ReviewRow label={tm('cancerCourse.label')} namespace="cancerCourses" value={medical.cancerCourse} />
                <ReviewBooleanRow label={tm('cancerAtypicalFeatures.label')} value={medical.cancerAtypicalFeatures} />
              </>
            )}
            {medical.symptomCategory === NEUROCOGNITIVE_PVS && (
              <>
                <ReviewRow label={tm('cognitiveSymptomType.label')} namespace="cognitiveSymptomTypes" value={medical.cognitiveSymptomType} />
                <ReviewBooleanRow label={tm('postExertionalMalaise.label')} value={medical.postExertionalMalaise} />
              </>
            )}
            <ReviewRow label={tm('symptomPersistence.label')} namespace="symptomPersistence" value={medical.symptomPersistence} />
            <ReviewRow label={tm('seriousness.label')} namespace="medicalSeriousness" value={medical.seriousness} hideWhen="NONE" />
            <ReviewRow label={tm('onsetWindow.label')} namespace="reportTimingWindows" value={medical.onsetWindow} />
            <ReviewRow label={tm('medicalCareEngagement.label')} namespace="medicalCareEngagement" value={medical.medicalCareEngagement} />
            <ReviewRow label={tm('vaccineManufacturer.label')} namespace="vaccineManufacturers" value={medical.vaccineManufacturer} />
            <ReviewValueRow label={tm('doseNumber.label')} value={medical.doseNumber} />
            <ReviewBooleanRow label={tm('preExistingCondition.label')} value={medical.preExistingCondition} />
          </>
        )}

        {!isMedical && social.impactCategory && (
          <>
            <ReviewRow label={ts('impactCategory.label')} namespace="socialEconomicImpactCategories" value={social.impactCategory} />
            <ReviewRow label={ts('vaccinationStatus.label')} namespace="vaccinationStatuses" value={social.vaccinationStatus} />
            <ReviewRow label={ts('employmentSector.label')} namespace="employmentSectors" value={social.employmentSector} />
            <ReviewRow label={ts('remedyPursued.label')} namespace="remediesPursued" value={social.remedyPursued} />
            <ReviewRow label={ts('relationshipAffected.label')} namespace="relationshipsAffected" value={social.relationshipAffected} />
            <ReviewRow label={ts('formalBasisAsserted.label')} namespace="formalBasisAsserted" value={social.formalBasisAsserted} />
            <ReviewRow label={ts('consequenceSeverity.label')} namespace="consequenceSeverity" value={social.consequenceSeverity} hideWhen="NONE" />
            <ReviewRow label={ts('outcomeStatus.label')} namespace="socialOutcomeStatus" value={social.outcomeStatus} />
            <ReviewRow label={ts('occurredDuring.label')} namespace="reportCalendarPeriods" value={social.occurredDuring} />
            <ReviewBooleanRow label={ts('documentationAvailable.label')} value={social.documentationAvailable} />
          </>
        )}

        <ReviewRow label={ta('ageLabel')} namespace="reporterAgeRanges" value={ageRange} />
        <ReviewRow label={ta('genderLabel')} namespace="reporterGenders" value={gender} />
      </div>

      {/* Says plainly why the list may be shorter than the form was, so a
          reporter does not read the omissions as answers having been lost. */}
      <p className="text-xs text-slate-400 leading-relaxed">{t('omitted')}</p>

      <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('consentHeading')}</h2>
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-slate-900"
          />
          {/* Art. 9(2)(a) consent has to be specific, so it names only the
              special categories this particular report actually contains.
              Religious belief is revealed by exactly one answer — a denied
              religious accommodation, which only the social form can even
              ask — so naming it on a medical report, or on a social one
              where it was not selected, would be asking consent for data
              the reporter never gave. */}
          <span className="text-sm text-slate-700 leading-relaxed">
            {!isMedical && social.formalBasisAsserted === RELIGIOUS_ACCOMMODATION_DENIED
              ? t('consentLabelWithReligion')
              : t('consentLabel')}
          </span>
        </label>
        <p className="text-xs text-slate-500 leading-relaxed">{t('consentDetail')}</p>
        {/* Irrevocability belongs at the point of consent, not only on the
            thank-you screen: agreeing to something that cannot be undone
            requires knowing it beforehand. */}
        <p className="text-xs text-slate-500 leading-relaxed">{t('consentIrrevocable')}</p>
      </div>

      {/* A SEPARATE checkbox, deliberately. Art. 9(2)(a) consent must be
          specific and unbundled — folding a truthfulness declaration into it
          would weaken the very thing that makes processing health data lawful.
          They are also different acts: one grants permission, the other
          asserts a fact, and only the second is what an aggregate claim rests
          on. Mirrors the Whistleblower flow's separate "legally obtained
          material" declaration. */}
      <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('declarationHeading')}
        </h2>
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-slate-900"
          />
          <span className="text-sm text-slate-700 leading-relaxed">{t('declarationLabel')}</span>
        </label>
        <p className="text-xs text-slate-500 leading-relaxed">{t('declarationDetail')}</p>
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
      )}

      <PrimaryButton onClick={onSubmit} disabled={!consent || !declaration || submitting}>
        {submitting ? t('submitting') : t('submit')}
      </PrimaryButton>
    </StepShell>
  );
}

function ExpiredStep({ onVerifyAgain }: { onVerifyAgain: () => void }) {
  const t = useTranslations('reports.errors');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-4">
        {t('expired')}
      </p>
      <PrimaryButton onClick={onVerifyAgain}>{t('verifyAgain')}</PrimaryButton>
    </div>
  );
}

function DoneStep({ onAnother }: { onAnother: () => void }) {
  const t = useTranslations('reports.done');
  return (
    <div className="space-y-5 text-center">
      <h1 className="text-xl font-bold text-slate-900">{t('heading')}</h1>
      <p className="text-sm text-slate-600 leading-relaxed text-start">{t('body')}</p>
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
        >
          {t('backHome')}
        </Link>
        <button type="button" onClick={onAnother} className="text-xs text-slate-500 underline hover:text-slate-800">
          {t('another')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewReportPage() {
  const t = useTranslations('reports');
  const tErrors = useTranslations('reports.errors');
  const tVerify = useTranslations('reports.verify');

  const [step, setStep] = useState<Step>('verify');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState('');

  const [domain, setDomain] = useState<Domain | null>(null);
  const [medical, setMedical] = useState<MedicalAnswers>(EMPTY_MEDICAL);
  const [social, setSocial] = useState<SocialAnswers>(EMPTY_SOCIAL);
  const [ageRange, setAgeRange] = useState<ReporterAgeRange>('UNKNOWN');
  const [gender, setGender] = useState<ReporterGender>('UNKNOWN');
  const [consent, setConsent] = useState(false);
  const [declaration, setDeclaration] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // This page is its own magic-link callback. Supabase returns the access
  // token in the URL fragment (never a query param), so only the client can
  // read it — and it is stripped from the address bar immediately, before
  // anything else runs, so a live token is not left sitting in the URL bar,
  // in history, or in whatever the reporter might copy or share.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const errorDescription = params.get('error_description');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (errorDescription) {
      setLinkError(errorDescription);
      return;
    }
    if (token) {
      setAccessToken(token);
      setStep('domain');
    }
  }, []);

  function restartVerification() {
    setAccessToken(null);
    setExpired(false);
    setSubmitError(null);
    setLinkError(null);
    setStep('verify');
  }

  function resetAnswers() {
    setDomain(null);
    setMedical(EMPTY_MEDICAL);
    setSocial(EMPTY_SOCIAL);
    setAgeRange('UNKNOWN');
    setGender('UNKNOWN');
    setConsent(false);
    setDeclaration(false);
    setSubmitError(null);
  }

  async function submit() {
    if (!domain || !accessToken) return;
    setSubmitting(true);
    setSubmitError(null);

    const path = domain === 'MEDICAL' ? '/api/reports/medical' : '/api/reports/social-economic';
    const report = domain === 'MEDICAL' ? medicalPayload(medical) : socialPayload(social);

    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          consentGiven: true,
          reporterAgeRange: ageRange,
          reporterGender: gender,
          report,
        }),
      });

      if (res.status === 401) {
        // The one-shot verification is spent or timed out. Nothing was
        // saved anywhere, so the only honest offer is to start over.
        setExpired(true);
        setAccessToken(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setSubmitError(body.message ?? body.error ?? tErrors('submitFailed'));
        return;
      }

      resetAnswers();
      setAccessToken(null);
      setStep('done');
    } catch {
      setSubmitError(tErrors('submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderStep() {
    if (expired) return <ExpiredStep onVerifyAgain={restartVerification} />;

    switch (step) {
      case 'verify':
        return (
          <VerifyStep
            linkError={linkError ? `${tVerify('linkInvalid')} (${linkError})` : null}
            onSent={(email) => {
              setSentTo(email);
              setStep('sent');
            }}
          />
        );
      case 'sent':
        return <SentStep email={sentTo} onRestart={restartVerification} />;
      case 'domain':
        return (
          <DomainStep
            onPick={(d) => {
              setDomain(d);
              setStep('category');
            }}
          />
        );
      case 'category':
        return domain ? (
          <CategoryStep
            domain={domain}
            medical={medical}
            social={social}
            setMedical={setMedical}
            setSocial={setSocial}
            onNext={() => setStep('details')}
            onBack={() => setStep('domain')}
          />
        ) : null;
      case 'details':
        return domain ? (
          <StepShell
            step="details"
            heading={t('questions.detailsHeading')}
            body={t('questions.hint')}
            onBack={() => setStep('category')}
          >
            <div className="space-y-5">
              {domain === 'MEDICAL' ? (
                <MedicalDetails answers={medical} setAnswers={setMedical} />
              ) : (
                <SocialDetails answers={social} setAnswers={setSocial} />
              )}
            </div>
            {(domain === 'MEDICAL' ? missingRequiredDetail(medical) : missingRequiredSocialDetail(social)) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('questions.requiredMissing')}
              </p>
            )}
            <PrimaryButton
              onClick={() => setStep('about')}
              disabled={domain === 'MEDICAL' ? missingRequiredDetail(medical) : missingRequiredSocialDetail(social)}
            >
              {t('continue')}
            </PrimaryButton>
            <MethodologyPanel domain={domain} />
          </StepShell>
        ) : null;
      case 'about':
        return (
          <AboutStep
            ageRange={ageRange}
            gender={gender}
            setAgeRange={setAgeRange}
            setGender={setGender}
            onNext={() => setStep('review')}
            onBack={() => setStep('details')}
          />
        );
      case 'review':
        return domain ? (
          <ReviewStep
            domain={domain}
            medical={medical}
            social={social}
            ageRange={ageRange}
            gender={gender}
            consent={consent}
            setConsent={setConsent}
            declaration={declaration}
            setDeclaration={setDeclaration}
            submitting={submitting}
            submitError={submitError}
            onSubmit={submit}
            onBack={() => setStep('about')}
          />
        ) : null;
      case 'done':
        return (
          <DoneStep
            onAnother={() => {
              resetAnswers();
              restartVerification();
            }}
          />
        );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader current="home" />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {step === 'verify' && (
          <div className="mb-6">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-400">{t('pageTitle')}</p>
            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{t('pageSubtitle')}</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7">
          {renderStep()}
        </div>
      </div>
    </main>
  );
}
