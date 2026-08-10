'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

interface CriminalComplaint {
  id: string;
  policeStatus: string;
  closureConsideredByCourt: boolean | null;
  custodyChangedAfterClosure: string | null;
  createdAt: string;
}

interface NzakutOrder {
  id: string;
  orderType: string;
  evidentiaryHearingHeld: boolean;
  daysWithoutMeritsHearing: number | null;
  childrenLocation: string | null;
  createdAt: string;
}

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

// ── Complaints section ────────────────────────────────────────────────────────

function ComplaintsSection() {
  const t = useTranslations('intake');
  const [complaints, setComplaints] = useState<CriminalComplaint[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    policeStatus: 'CLOSED_CLEARED',
    closureConsideredByCourt: '',
    custodyChangedAfterClosure: '',
  });

  useEffect(() => {
    apiFetch('/api/cases/me/complaints')
      .then((r) => r.json())
      .then((d: { complaints: CriminalComplaint[] }) => setComplaints(d.complaints))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    const body: Record<string, unknown> = { policeStatus: form.policeStatus };
    if (form.closureConsideredByCourt !== '') {
      body['closureConsideredByCourt'] = form.closureConsideredByCourt === 'true';
    }
    if (form.custodyChangedAfterClosure !== '') {
      body['custodyChangedAfterClosure'] = form.custodyChangedAfterClosure;
    }

    const res = await apiFetch('/api/cases/me/complaints', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const created = await res.json() as CriminalComplaint;
      setComplaints((prev) => [...prev, created]);
      setShowForm(false);
    }
    setSaving(false);
  }

  const STATUS_LABELS: Record<string, string> = {
    OPEN: t('statusOpen'),
    CLOSED_LACK_OF_EVIDENCE: t('statusClosedLoe'),
    CLOSED_CLEARED: t('statusClosedCleared'),
    CLOSED_OTHER: t('statusClosedOther'),
    UNKNOWN: t('statusUnknown'),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t('complaintsTab')}</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm bg-slate-700 hover:bg-slate-600 px-4 py-1.5 rounded-lg transition-colors"
          >
            + {t('addComplaint')}
          </button>
        )}
      </div>

      {complaints.length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">{t('noComplaints')}</p>
      )}

      <div className="flex flex-col gap-3 mb-4">
        {complaints.map((c) => (
          <div key={c.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm">
            <span className="font-semibold text-slate-200">{STATUS_LABELS[c.policeStatus] ?? c.policeStatus}</span>
            {c.closureConsideredByCourt === false && (
              <span className="ms-3 text-amber-400">· {t('closureConsidered')}: {t('no')}</span>
            )}
            {c.custodyChangedAfterClosure && (
              <span className="ms-3 text-slate-400">· {t('custodyChange')}: {c.custodyChangedAfterClosure}</span>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('policeStatus')}</label>
            <select
              value={form.policeStatus}
              onChange={(e) => setForm({ ...form, policeStatus: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="OPEN">{t('statusOpen')}</option>
              <option value="CLOSED_LACK_OF_EVIDENCE">{t('statusClosedLoe')}</option>
              <option value="CLOSED_CLEARED">{t('statusClosedCleared')}</option>
              <option value="CLOSED_OTHER">{t('statusClosedOther')}</option>
              <option value="UNKNOWN">{t('statusUnknown')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('closureConsidered')}</label>
            <select
              value={form.closureConsideredByCourt}
              onChange={(e) => setForm({ ...form, closureConsideredByCourt: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">{t('unknown')}</option>
              <option value="true">{t('yes')}</option>
              <option value="false">{t('no')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('custodyChange')}</label>
            <select
              value={form.custodyChangedAfterClosure}
              onChange={(e) => setForm({ ...form, custodyChangedAfterClosure: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">{t('unknown')}</option>
              <option value="worsened">{t('worsened')}</option>
              <option value="unchanged">{t('unchanged')}</option>
              <option value="improved">{t('improved')}</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? '...' : t('save')}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-white px-5 py-2 rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nzakut section ────────────────────────────────────────────────────────────

function NzakutSection() {
  const t = useTranslations('intake');
  const [orders, setOrders] = useState<NzakutOrder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    orderType: 'STANDARD',
    evidentiaryHearingHeld: 'false',
    daysWithoutMeritsHearing: '',
    childrenLocation: '',
  });

  useEffect(() => {
    apiFetch('/api/cases/me/nzakut')
      .then((r) => r.json())
      .then((d: { orders: NzakutOrder[] }) => setOrders(d.orders))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    const body: Record<string, unknown> = {
      orderType: form.orderType,
      evidentiaryHearingHeld: form.evidentiaryHearingHeld === 'true',
    };
    if (form.daysWithoutMeritsHearing !== '') {
      body['daysWithoutMeritsHearing'] = parseInt(form.daysWithoutMeritsHearing, 10);
    }
    if (form.childrenLocation !== '') {
      body['childrenLocation'] = form.childrenLocation;
    }

    const res = await apiFetch('/api/cases/me/nzakut', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const created = await res.json() as NzakutOrder;
      setOrders((prev) => [...prev, created]);
      setShowForm(false);
    }
    setSaving(false);
  }

  const LOCATION_LABELS: Record<string, string> = {
    other_parent: t('otherParent'),
    foster: t('foster'),
    institution: t('institution'),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t('nzakutTab')}</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm bg-slate-700 hover:bg-slate-600 px-4 py-1.5 rounded-lg transition-colors"
          >
            + {t('addNzakut')}
          </button>
        )}
      </div>

      {orders.length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">{t('noOrders')}</p>
      )}

      <div className="flex flex-col gap-3 mb-4">
        {orders.map((o) => (
          <div key={o.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm">
            <span className="font-semibold text-slate-200">
              {o.orderType === 'EMERGENCY' ? t('typeEmergency') : t('typeStandard')}
            </span>
            <span className={`ms-3 ${o.evidentiaryHearingHeld ? 'text-slate-400' : 'text-amber-400'}`}>
              · {t('evidentiaryHearing')}: {o.evidentiaryHearingHeld ? t('yes') : t('no')}
            </span>
            {o.daysWithoutMeritsHearing !== null && (
              <span className={`ms-3 ${o.daysWithoutMeritsHearing >= 365 ? 'text-red-400' : 'text-slate-400'}`}>
                · {o.daysWithoutMeritsHearing} {t('daysWithoutHearing')}
              </span>
            )}
            {o.childrenLocation && (
              <span className="ms-3 text-slate-400">
                · {LOCATION_LABELS[o.childrenLocation] ?? o.childrenLocation}
              </span>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('orderType')}</label>
            <select
              value={form.orderType}
              onChange={(e) => setForm({ ...form, orderType: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="STANDARD">{t('typeStandard')}</option>
              <option value="EMERGENCY">{t('typeEmergency')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('evidentiaryHearing')}</label>
            <select
              value={form.evidentiaryHearingHeld}
              onChange={(e) => setForm({ ...form, evidentiaryHearingHeld: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="false">{t('no')}</option>
              <option value="true">{t('yes')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('daysWithoutHearing')}</label>
            <input
              type="number"
              min="0"
              value={form.daysWithoutMeritsHearing}
              onChange={(e) => setForm({ ...form, daysWithoutMeritsHearing: e.target.value })}
              placeholder="0"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('childrenLocation')}</label>
            <select
              value={form.childrenLocation}
              onChange={(e) => setForm({ ...form, childrenLocation: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">{t('unknown')}</option>
              <option value="other_parent">{t('otherParent')}</option>
              <option value="foster">{t('foster')}</option>
              <option value="institution">{t('institution')}</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? '...' : t('save')}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-white px-5 py-2 rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'complaints' | 'nzakut';

export default function IntakePage() {
  const t = useTranslations('intake');
  const [tab, setTab] = useState<Tab>('complaints');

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl mb-8 w-fit">
        {(['complaints', 'nzakut'] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {key === 'complaints' ? t('complaintsTab') : t('nzakutTab')}
          </button>
        ))}
      </div>

      {tab === 'complaints' ? <ComplaintsSection /> : <NzakutSection />}
    </div>
  );
}
