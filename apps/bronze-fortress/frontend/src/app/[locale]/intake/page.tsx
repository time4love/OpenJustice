'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CriminalComplaint {
  id: string;
  policeStatus: string;
  closureConsideredByCourt: boolean | null;
  custodyChangedAfterClosure: string | null;
}

interface NzakutOrder {
  id: string;
  orderType: string;
  evidentiaryHearingHeld: boolean;
  daysWithoutMeritsHearing: number | null;
}

interface WelfareReport {
  id: string;
  welfareReferralAtFirstHearing: boolean;
  interviewOneSided: boolean | null;
  homeVisitConducted: boolean | null;
  citedDroppedAllegations: boolean | null;
  recommendationChanged: boolean | null;
}

interface EvaluatorSession {
  id: string;
  sessionCount: number;
  totalDurationMinutes: number | null;
  bothParentsInterviewed: boolean;
  feedbackSessionHeld: boolean;
}

interface GuardianContact {
  id: string;
  childMeetingCount: number;
  positionContradictsChild: boolean | null;
}

interface PatternSuggestion {
  patternCategory: string;
  evidence: string;
  alreadyRegistered: boolean;
}

interface PatternResultData {
  figureName: string;
  patterns: PatternSuggestion[];
  newAllegationsCreated: number;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = await getToken();
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────

function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-slate-900 border-t border-slate-700 rounded-t-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '90dvh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>
        <div className="px-6 py-3 border-b border-slate-800">
          <h2 className="font-semibold text-slate-100">{title}</h2>
        </div>
        <div
          className="overflow-y-auto px-6 py-5 flex flex-col gap-4"
          style={{ maxHeight: 'calc(90dvh - 76px)' }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

// ── Shared field components ───────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white [color-scheme:dark] focus:outline-none focus:border-amber-500';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function BoolSelect({
  value,
  onChange,
  yesLabel,
  noLabel,
  unknownLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  yesLabel: string;
  noLabel: string;
  unknownLabel: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
      <option value="">{unknownLabel}</option>
      <option value="true">{yesLabel}</option>
      <option value="false">{noLabel}</option>
    </select>
  );
}

function SaveButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="pt-2">
      <button
        type="submit"
        disabled={saving}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-4 rounded-xl transition-colors text-base"
      >
        {saving ? '...' : label}
      </button>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  title,
  count,
  onAdd,
  addLabel,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  addLabel: string;
  emptyLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-200">{title}</span>
          {count > 0 && (
            <span className="bg-amber-500/15 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-amber-400 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>{addLabel}</span>
        </button>
      </div>
      <div className="border-t border-slate-700/50">
        {count === 0 ? (
          <p className="px-5 py-3 text-slate-500 text-sm">{emptyLabel}</p>
        ) : (
          <div className="px-5 py-3 flex flex-col gap-2">{children}</div>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  primary,
  secondary,
  flagged = false,
}: {
  primary: string;
  secondary?: string;
  flagged?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-2.5 text-sm ${
        flagged ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-700/40'
      }`}
    >
      <span className={flagged ? 'text-amber-300' : 'text-slate-200'}>{primary}</span>
      {secondary && <span className="text-slate-400 ms-2">{secondary}</span>}
    </div>
  );
}

// ── Pattern result panel ──────────────────────────────────────────────────────

function PatternResultPanel({
  result,
  onDismiss,
  onAddAnother,
  t,
}: {
  result: PatternResultData;
  onDismiss: () => void;
  onAddAnother: () => void;
  t: ReturnType<typeof useTranslations<'intake'>>;
}) {
  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <p className="font-semibold text-emerald-400 mb-1">{t('allegationRegistered')}</p>
        <p className="text-sm text-slate-400">
          {result.newAllegationsCreated > 0
            ? t('allegationsCreated', { count: result.newAllegationsCreated })
            : t('allegationsAlreadyRegistered')}
        </p>
      </div>

      {result.patterns.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide px-1">{t('detectedPatterns')}</p>
          {result.patterns.map((p) => {
            const labelKey = `patterns.${p.patternCategory}.label` as Parameters<typeof t>[0];
            const descKey = `patterns.${p.patternCategory}.desc` as Parameters<typeof t>[0];
            const label = t.has(labelKey) ? t(labelKey) : p.patternCategory;
            const desc = t.has(descKey) ? t(descKey) : p.evidence;
            return (
              <div
                key={p.patternCategory}
                className={`bg-slate-800/50 border rounded-xl p-4 ${
                  p.alreadyRegistered ? 'border-slate-700 opacity-60' : 'border-amber-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className={`font-semibold text-sm ${p.alreadyRegistered ? 'text-slate-400' : 'text-slate-100'}`}>
                    {label}
                  </p>
                  <span
                    className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                      p.alreadyRegistered
                        ? 'text-slate-500 bg-slate-700'
                        : 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                    }`}
                  >
                    {p.alreadyRegistered ? t('alreadyRegistered') : '✓'}
                  </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-slate-500 text-sm px-1">{t('noPatterns')}</p>
      )}

      <div className="flex gap-4 items-center pt-1">
        <button
          onClick={onAddAnother}
          className="text-amber-400 hover:text-amber-300 text-sm transition-colors"
        >
          + {t('nominateAnother')}
        </button>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SheetType = 'complaint' | 'nzakut' | 'welfare' | 'evaluator' | 'guardian' | 'actor';

export default function IntakePage() {
  const t = useTranslations('intake');
  const router = useRouter();

  // Data
  const [complaints, setComplaints] = useState<CriminalComplaint[]>([]);
  const [orders, setOrders] = useState<NzakutOrder[]>([]);
  const [welfareReports, setWelfareReports] = useState<WelfareReport[]>([]);
  const [evaluatorSessions, setEvaluatorSessions] = useState<EvaluatorSession[]>([]);
  const [guardianContacts, setGuardianContacts] = useState<GuardianContact[]>([]);

  // UI
  const [activeSheet, setActiveSheet] = useState<SheetType | null>(null);
  const [patternResult, setPatternResult] = useState<PatternResultData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }

      const [c, n, w, e, g] = await Promise.all([
        apiFetch('/api/cases/me/complaints').then((r) => r.json() as Promise<{ complaints?: CriminalComplaint[] }>).catch(() => ({})),
        apiFetch('/api/cases/me/nzakut').then((r) => r.json() as Promise<{ orders?: NzakutOrder[] }>).catch(() => ({})),
        apiFetch('/api/cases/me/welfare').then((r) => r.json() as Promise<{ reports?: WelfareReport[] }>).catch(() => ({})),
        apiFetch('/api/cases/me/evaluator').then((r) => r.json() as Promise<{ sessions?: EvaluatorSession[] }>).catch(() => ({})),
        apiFetch('/api/cases/me/guardian').then((r) => r.json() as Promise<{ contacts?: GuardianContact[] }>).catch(() => ({})),
      ]);
      setComplaints((c as { complaints?: CriminalComplaint[] }).complaints ?? []);
      setOrders((n as { orders?: NzakutOrder[] }).orders ?? []);
      setWelfareReports((w as { reports?: WelfareReport[] }).reports ?? []);
      setEvaluatorSessions((e as { sessions?: EvaluatorSession[] }).sessions ?? []);
      setGuardianContacts((g as { contacts?: GuardianContact[] }).contacts ?? []);
    })();
  }, []);

  const closeSheet = useCallback(() => setActiveSheet(null), []);

  // ── Form state ──────────────────────────────────────────────────────────────

  const [complaintForm, setComplaintForm] = useState({
    policeStatus: 'CLOSED_CLEARED',
    closureConsideredByCourt: '',
    custodyChangedAfterClosure: '',
  });

  const [nzakutForm, setNzakutForm] = useState({
    orderType: 'STANDARD',
    evidentiaryHearingHeld: 'false',
    daysWithoutMeritsHearing: '',
    childrenLocation: '',
  });

  const [welfareForm, setWelfareForm] = useState({
    welfareReferralAtFirstHearing: 'false',
    interviewOneSided: '',
    homeVisitConducted: '',
    citedDroppedAllegations: '',
    recommendationChanged: '',
  });

  const [evaluatorForm, setEvaluatorForm] = useState({
    sessionCount: '1',
    totalDurationMinutes: '',
    bothParentsInterviewed: 'false',
    feedbackSessionHeld: 'false',
    judgeAdoptedWithoutReview: '',
  });

  const [guardianForm, setGuardianForm] = useState({
    childMeetingCount: '0',
    positionContradictsChild: '',
  });

  const [actorForm, setActorForm] = useState({
    name: '',
    type: '',
    organization: '',
  });

  // ── Save handlers ───────────────────────────────────────────────────────────

  async function saveComplaint(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = { policeStatus: complaintForm.policeStatus };
    if (complaintForm.closureConsideredByCourt !== '')
      body['closureConsideredByCourt'] = complaintForm.closureConsideredByCourt === 'true';
    if (complaintForm.custodyChangedAfterClosure !== '')
      body['custodyChangedAfterClosure'] = complaintForm.custodyChangedAfterClosure;
    const res = await apiFetch('/api/cases/me/complaints', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const created = await res.json() as CriminalComplaint;
      setComplaints((prev) => [...prev, created]);
      closeSheet();
    }
    setSaving(false);
  }

  async function saveNzakut(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      orderType: nzakutForm.orderType,
      evidentiaryHearingHeld: nzakutForm.evidentiaryHearingHeld === 'true',
    };
    if (nzakutForm.daysWithoutMeritsHearing !== '')
      body['daysWithoutMeritsHearing'] = parseInt(nzakutForm.daysWithoutMeritsHearing, 10);
    if (nzakutForm.childrenLocation !== '')
      body['childrenLocation'] = nzakutForm.childrenLocation;
    const res = await apiFetch('/api/cases/me/nzakut', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const created = await res.json() as NzakutOrder;
      setOrders((prev) => [...prev, created]);
      closeSheet();
    }
    setSaving(false);
  }

  async function saveWelfare(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      welfareReferralAtFirstHearing: welfareForm.welfareReferralAtFirstHearing === 'true',
    };
    if (welfareForm.interviewOneSided !== '')
      body['interviewOneSided'] = welfareForm.interviewOneSided === 'true';
    if (welfareForm.homeVisitConducted !== '')
      body['homeVisitConducted'] = welfareForm.homeVisitConducted === 'true';
    if (welfareForm.citedDroppedAllegations !== '')
      body['citedDroppedAllegations'] = welfareForm.citedDroppedAllegations === 'true';
    if (welfareForm.recommendationChanged !== '')
      body['recommendationChanged'] = welfareForm.recommendationChanged === 'true';
    const res = await apiFetch('/api/cases/me/welfare', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const created = await res.json() as WelfareReport;
      setWelfareReports((prev) => [...prev, created]);
      closeSheet();
    }
    setSaving(false);
  }

  async function saveEvaluator(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      sessionCount: parseInt(evaluatorForm.sessionCount, 10),
      bothParentsInterviewed: evaluatorForm.bothParentsInterviewed === 'true',
      feedbackSessionHeld: evaluatorForm.feedbackSessionHeld === 'true',
    };
    if (evaluatorForm.totalDurationMinutes !== '')
      body['totalDurationMinutes'] = parseInt(evaluatorForm.totalDurationMinutes, 10);
    if (evaluatorForm.judgeAdoptedWithoutReview !== '')
      body['judgeAdoptedWithoutReview'] = evaluatorForm.judgeAdoptedWithoutReview === 'true';
    const res = await apiFetch('/api/cases/me/evaluator', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const created = await res.json() as EvaluatorSession;
      setEvaluatorSessions((prev) => [...prev, created]);
      closeSheet();
    }
    setSaving(false);
  }

  async function saveGuardian(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      childMeetingCount: parseInt(guardianForm.childMeetingCount, 10),
    };
    if (guardianForm.positionContradictsChild !== '')
      body['positionContradictsChild'] = guardianForm.positionContradictsChild === 'true';
    const res = await apiFetch('/api/cases/me/guardian', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const created = await res.json() as GuardianContact;
      setGuardianContacts((prev) => [...prev, created]);
      closeSheet();
    }
    setSaving(false);
  }

  async function saveActor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, string> = { name: actorForm.name, type: actorForm.type };
    if (actorForm.organization) body['organization'] = actorForm.organization;
    const res = await apiFetch('/api/figures/nominate', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json() as {
        figureName?: string;
        patterns?: PatternSuggestion[];
        newAllegationsCreated?: number;
      };
      setPatternResult({
        figureName: data.figureName ?? actorForm.name,
        patterns: data.patterns ?? [],
        newAllegationsCreated: data.newAllegationsCreated ?? 0,
      });
      setActorForm({ name: '', type: '', organization: '' });
      closeSheet();
    }
    setSaving(false);
  }

  // ── Actor form config ───────────────────────────────────────────────────────

  const FIGURE_TYPE_LABELS: Record<string, string> = {
    JUDGE: t('figureJudge'),
    SOCIAL_WORKER: t('figureSocialWorker'),
    EVALUATOR: t('figureEvaluator'),
    GUARDIAN_AD_LITEM: t('figureGuardian'),
    YOUTH_PROBATION: t('figureProbation'),
    OTHER: t('figureOther'),
  };

  const ORG_LABELS: Partial<Record<string, string>> = {
    SOCIAL_WORKER: t('orgLabelWelfare'),
    EVALUATOR:     t('orgLabelEvaluator'),
    OTHER:         t('orgLabelOther'),
  };

  // ── Sheet title map ─────────────────────────────────────────────────────────

  const sheetTitle: Record<SheetType, string> = {
    complaint: t('addComplaint'),
    nzakut:    t('addNzakut'),
    welfare:   t('addWelfare'),
    evaluator: t('addEvaluator'),
    guardian:  t('addGuardian'),
    actor:     t('allegationTab'),
  };

  // ── Display labels ──────────────────────────────────────────────────────────

  const STATUS_LABELS: Record<string, string> = {
    OPEN: t('statusOpen'),
    CLOSED_LACK_OF_EVIDENCE: t('statusClosedLoe'),
    CLOSED_CLEARED: t('statusClosedCleared'),
    CLOSED_OTHER: t('statusClosedOther'),
    UNKNOWN: t('statusUnknown'),
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6 px-2">{t('title')}</h1>

      {patternResult && (
        <div className="px-2 mb-4">
          <PatternResultPanel
            result={patternResult}
            t={t}
            onDismiss={() => setPatternResult(null)}
            onAddAnother={() => { setPatternResult(null); setActiveSheet('actor'); }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">

        {/* Domain A */}
        <SectionCard
          title={t('complaintsTab')}
          count={complaints.length}
          onAdd={() => setActiveSheet('complaint')}
          addLabel={t('addComplaint')}
          emptyLabel={t('noComplaints')}
        >
          {complaints.map((c) => (
            <ItemRow
              key={c.id}
              primary={STATUS_LABELS[c.policeStatus] ?? c.policeStatus}
              secondary={c.closureConsideredByCourt === false ? `${t('closureConsidered')}: ${t('no')}` : undefined}
              flagged={c.closureConsideredByCourt === false}
            />
          ))}
        </SectionCard>

        {/* Domain B */}
        <SectionCard
          title={t('nzakutTab')}
          count={orders.length}
          onAdd={() => setActiveSheet('nzakut')}
          addLabel={t('addNzakut')}
          emptyLabel={t('noOrders')}
        >
          {orders.map((o) => (
            <ItemRow
              key={o.id}
              primary={o.orderType === 'EMERGENCY' ? t('typeEmergency') : t('typeStandard')}
              secondary={
                o.daysWithoutMeritsHearing != null
                  ? `${o.daysWithoutMeritsHearing} ${t('daysWithoutHearing')}`
                  : undefined
              }
              flagged={!o.evidentiaryHearingHeld}
            />
          ))}
        </SectionCard>

        {/* Domain C */}
        <SectionCard
          title={t('welfareTab')}
          count={welfareReports.length}
          onAdd={() => setActiveSheet('welfare')}
          addLabel={t('addWelfare')}
          emptyLabel={t('noWelfare')}
        >
          {welfareReports.map((w) => {
            const flags = [
              w.welfareReferralAtFirstHearing,
              w.interviewOneSided === true,
              w.homeVisitConducted === false,
              w.citedDroppedAllegations === true,
              w.recommendationChanged === true,
            ].filter(Boolean).length;
            return (
              <ItemRow
                key={w.id}
                primary={t('welfareTab')}
                secondary={flags > 0 ? `${flags} ×` : undefined}
                flagged={flags > 0}
              />
            );
          })}
        </SectionCard>

        {/* Domain D */}
        <SectionCard
          title={t('evaluatorTab')}
          count={evaluatorSessions.length}
          onAdd={() => setActiveSheet('evaluator')}
          addLabel={t('addEvaluator')}
          emptyLabel={t('noEvaluator')}
        >
          {evaluatorSessions.map((e) => (
            <ItemRow
              key={e.id}
              primary={`${e.sessionCount} ${t('sessionCount')}`}
              secondary={e.totalDurationMinutes != null ? `${e.totalDurationMinutes} min` : undefined}
              flagged={!e.feedbackSessionHeld || !e.bothParentsInterviewed}
            />
          ))}
        </SectionCard>

        {/* Domain E */}
        <SectionCard
          title={t('guardianTab')}
          count={guardianContacts.length}
          onAdd={() => setActiveSheet('guardian')}
          addLabel={t('addGuardian')}
          emptyLabel={t('noGuardian')}
        >
          {guardianContacts.map((g) => (
            <ItemRow
              key={g.id}
              primary={`${g.childMeetingCount} ${t('childMeetingCount')}`}
              flagged={g.childMeetingCount <= 1 || g.positionContradictsChild === true}
            />
          ))}
        </SectionCard>

        {/* Case actors */}
        <SectionCard
          title={t('allegationTab')}
          count={0}
          onAdd={() => setActiveSheet('actor')}
          addLabel={t('submitAllegation')}
          emptyLabel={t('allegationExplainer')}
        />

      </div>

      {/* Bottom sheet — single instance, different form per activeSheet */}
      <BottomSheet
        open={activeSheet !== null}
        onClose={closeSheet}
        title={activeSheet ? sheetTitle[activeSheet] : ''}
      >
        {/* Domain A form */}
        {activeSheet === 'complaint' && (
          <form onSubmit={saveComplaint} className="flex flex-col gap-4">
            <FormField label={t('policeStatus')}>
              <select
                value={complaintForm.policeStatus}
                onChange={(e) => setComplaintForm({ ...complaintForm, policeStatus: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="OPEN">{t('statusOpen')}</option>
                <option value="CLOSED_LACK_OF_EVIDENCE">{t('statusClosedLoe')}</option>
                <option value="CLOSED_CLEARED">{t('statusClosedCleared')}</option>
                <option value="CLOSED_OTHER">{t('statusClosedOther')}</option>
                <option value="UNKNOWN">{t('statusUnknown')}</option>
              </select>
            </FormField>
            <FormField label={t('closureConsidered')}>
              <BoolSelect
                value={complaintForm.closureConsideredByCourt}
                onChange={(v) => setComplaintForm({ ...complaintForm, closureConsideredByCourt: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('custodyChange')}>
              <select
                value={complaintForm.custodyChangedAfterClosure}
                onChange={(e) => setComplaintForm({ ...complaintForm, custodyChangedAfterClosure: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">{t('unknown')}</option>
                <option value="worsened">{t('worsened')}</option>
                <option value="unchanged">{t('unchanged')}</option>
                <option value="improved">{t('improved')}</option>
              </select>
            </FormField>
            <SaveButton saving={saving} label={t('save')} />
          </form>
        )}

        {/* Domain B form */}
        {activeSheet === 'nzakut' && (
          <form onSubmit={saveNzakut} className="flex flex-col gap-4">
            <FormField label={t('orderType')}>
              <select
                value={nzakutForm.orderType}
                onChange={(e) => setNzakutForm({ ...nzakutForm, orderType: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="STANDARD">{t('typeStandard')}</option>
                <option value="EMERGENCY">{t('typeEmergency')}</option>
              </select>
            </FormField>
            <FormField label={t('evidentiaryHearing')}>
              <BoolSelect
                value={nzakutForm.evidentiaryHearingHeld}
                onChange={(v) => setNzakutForm({ ...nzakutForm, evidentiaryHearingHeld: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('daysWithoutHearing')}>
              <input
                type="number" min="0"
                value={nzakutForm.daysWithoutMeritsHearing}
                onChange={(e) => setNzakutForm({ ...nzakutForm, daysWithoutMeritsHearing: e.target.value })}
                placeholder="0"
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label={t('childrenLocation')}>
              <select
                value={nzakutForm.childrenLocation}
                onChange={(e) => setNzakutForm({ ...nzakutForm, childrenLocation: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">{t('unknown')}</option>
                <option value="other_parent">{t('otherParent')}</option>
                <option value="foster">{t('foster')}</option>
                <option value="institution">{t('institution')}</option>
              </select>
            </FormField>
            <SaveButton saving={saving} label={t('save')} />
          </form>
        )}

        {/* Domain C form */}
        {activeSheet === 'welfare' && (
          <form onSubmit={saveWelfare} className="flex flex-col gap-4">
            <FormField label={t('welfareReferralAtFirstHearing')}>
              <BoolSelect
                value={welfareForm.welfareReferralAtFirstHearing}
                onChange={(v) => setWelfareForm({ ...welfareForm, welfareReferralAtFirstHearing: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('interviewOneSided')}>
              <BoolSelect
                value={welfareForm.interviewOneSided}
                onChange={(v) => setWelfareForm({ ...welfareForm, interviewOneSided: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('homeVisitConducted')}>
              <BoolSelect
                value={welfareForm.homeVisitConducted}
                onChange={(v) => setWelfareForm({ ...welfareForm, homeVisitConducted: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('citedDroppedAllegations')}>
              <BoolSelect
                value={welfareForm.citedDroppedAllegations}
                onChange={(v) => setWelfareForm({ ...welfareForm, citedDroppedAllegations: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('recommendationChanged')}>
              <BoolSelect
                value={welfareForm.recommendationChanged}
                onChange={(v) => setWelfareForm({ ...welfareForm, recommendationChanged: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <SaveButton saving={saving} label={t('save')} />
          </form>
        )}

        {/* Domain D form */}
        {activeSheet === 'evaluator' && (
          <form onSubmit={saveEvaluator} className="flex flex-col gap-4">
            <FormField label={t('sessionCount')}>
              <input
                type="number" min="1"
                value={evaluatorForm.sessionCount}
                onChange={(e) => setEvaluatorForm({ ...evaluatorForm, sessionCount: e.target.value })}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label={t('totalDurationMinutes')}>
              <input
                type="number" min="0"
                value={evaluatorForm.totalDurationMinutes}
                onChange={(e) => setEvaluatorForm({ ...evaluatorForm, totalDurationMinutes: e.target.value })}
                placeholder={t('optional')}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label={t('bothParentsInterviewed')}>
              <BoolSelect
                value={evaluatorForm.bothParentsInterviewed}
                onChange={(v) => setEvaluatorForm({ ...evaluatorForm, bothParentsInterviewed: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('feedbackSessionHeld')}>
              <BoolSelect
                value={evaluatorForm.feedbackSessionHeld}
                onChange={(v) => setEvaluatorForm({ ...evaluatorForm, feedbackSessionHeld: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <FormField label={t('judgeAdoptedWithoutReview')}>
              <BoolSelect
                value={evaluatorForm.judgeAdoptedWithoutReview}
                onChange={(v) => setEvaluatorForm({ ...evaluatorForm, judgeAdoptedWithoutReview: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <SaveButton saving={saving} label={t('save')} />
          </form>
        )}

        {/* Domain E form */}
        {activeSheet === 'guardian' && (
          <form onSubmit={saveGuardian} className="flex flex-col gap-4">
            <FormField label={t('childMeetingCount')}>
              <input
                type="number" min="0"
                value={guardianForm.childMeetingCount}
                onChange={(e) => setGuardianForm({ ...guardianForm, childMeetingCount: e.target.value })}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label={t('positionContradictsChild')}>
              <BoolSelect
                value={guardianForm.positionContradictsChild}
                onChange={(v) => setGuardianForm({ ...guardianForm, positionContradictsChild: v })}
                yesLabel={t('yes')} noLabel={t('no')} unknownLabel={t('unknown')}
              />
            </FormField>
            <SaveButton saving={saving} label={t('save')} />
          </form>
        )}

        {/* Actor nomination form */}
        {activeSheet === 'actor' && (
          <form onSubmit={saveActor} className="flex flex-col gap-4">
            <p className="text-slate-400 text-sm">{t('allegationExplainer')}</p>
            <FormField label={t('figureType')}>
              <select
                value={actorForm.type}
                onChange={(e) => setActorForm({ ...actorForm, type: e.target.value, organization: '' })}
                className={INPUT_CLASS}
              >
                <option value="">{t('figureTypePlaceholder')}</option>
                {Object.entries(FIGURE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>
            {actorForm.type && (
              <>
                <FormField label={t('figureName')}>
                  <input
                    value={actorForm.name}
                    onChange={(e) => setActorForm({ ...actorForm, name: e.target.value })}
                    required
                    className={INPUT_CLASS}
                  />
                </FormField>
                {ORG_LABELS[actorForm.type] && (
                  <FormField label={ORG_LABELS[actorForm.type]!}>
                    <input
                      value={actorForm.organization}
                      onChange={(e) => setActorForm({ ...actorForm, organization: e.target.value })}
                      placeholder={t('optional')}
                      className={INPUT_CLASS}
                    />
                  </FormField>
                )}
                <SaveButton saving={saving} label={t('submitAllegation')} />
              </>
            )}
          </form>
        )}
      </BottomSheet>
    </div>
  );
}
