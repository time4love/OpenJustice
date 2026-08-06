'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'Side Effect Withholding' | 'Regulatory Misleading' | 'Coercion' | 'Other';

type EvidenceTier =
  | 'Tier 1: Smoking Gun'
  | 'Tier 2: Material'
  | 'Tier 3: Supporting'
  | 'Tier 4: Anecdotal';

const CATEGORIES: Category[] = [
  'Side Effect Withholding',
  'Regulatory Misleading',
  'Coercion',
  'Other',
];

const TIERS: EvidenceTier[] = [
  'Tier 1: Smoking Gun',
  'Tier 2: Material',
  'Tier 3: Supporting',
  'Tier 4: Anecdotal',
];

type Phase = 'upload' | 'analyzing' | 'review' | 'confirming' | 'confirmed';

interface DraftAnalysis {
  isRelevant: boolean;
  category: Category;
  summary: string;
  missingInformation: string[];
  targetEntity: string;
  evidenceTier: EvidenceTier;
}

interface ConfirmedResult {
  fileHash: string;
  txHash: string;
  analysis: DraftAnalysis;
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function tierColor(tier: string): string {
  if (tier.startsWith('Tier 1')) return 'text-red-400 border-red-800 bg-red-950';
  if (tier.startsWith('Tier 2')) return 'text-orange-400 border-orange-800 bg-orange-950';
  if (tier.startsWith('Tier 3')) return 'text-yellow-400 border-yellow-800 bg-yellow-950';
  return 'text-slate-400 border-slate-700 bg-slate-800';
}

function tierDotColor(tier: string): string {
  if (tier.startsWith('Tier 1')) return 'bg-red-500';
  if (tier.startsWith('Tier 2')) return 'bg-orange-500';
  if (tier.startsWith('Tier 3')) return 'bg-yellow-500';
  return 'bg-slate-500';
}

// ---------------------------------------------------------------------------
// Language switcher
// ---------------------------------------------------------------------------

function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      {(['he', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-2 py-1 rounded transition-colors ${
            locale === l
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Zone component
// ---------------------------------------------------------------------------

function UploadZone({
  selectedFile,
  onFileSelect,
  t,
}: {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  t: ReturnType<typeof useTranslations<'submit.upload'>>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-950/20'
          : selectedFile
          ? 'border-emerald-700 bg-emerald-950/10'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <div className="text-3xl mb-3 text-slate-600">
        {selectedFile ? '📎' : '⬆'}
      </div>
      {selectedFile ? (
        <p className="text-sm text-emerald-400 font-medium">
          {t('fileSelected')} {selectedFile.name}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-400">{t('dragDrop')}</p>
          <p className="text-xs text-slate-600 mt-1">{t('fileTypes')}</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / loading
// ---------------------------------------------------------------------------

function AnalyzingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 bg-slate-800 rounded w-1/2" />
      <div className="h-16 bg-slate-800 rounded" />
      <div className="h-3 bg-slate-800 rounded w-2/3" />
      <div className="h-3 bg-slate-800 rounded w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review panel
// ---------------------------------------------------------------------------

function ReviewPanel({
  draft,
  category,
  targetEntity,
  evidenceTier,
  walletAddress,
  onCategoryChange,
  onEntityChange,
  onTierChange,
  onWalletChange,
  onConfirm,
  onReset,
  confirming,
  t,
  tc,
}: {
  draft: DraftAnalysis;
  category: Category;
  targetEntity: string;
  evidenceTier: EvidenceTier;
  walletAddress: string;
  onCategoryChange: (v: Category) => void;
  onEntityChange: (v: string) => void;
  onTierChange: (v: EvidenceTier) => void;
  onWalletChange: (v: string) => void;
  onConfirm: () => void;
  onReset: () => void;
  confirming: boolean;
  t: ReturnType<typeof useTranslations<'submit.review'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}) {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={onReset}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {t('changeFileBtn')}
      </button>

      {/* Irrelevant warning */}
      {!draft.isRelevant && (
        <div className="bg-yellow-950/40 border border-yellow-800 rounded-lg p-4">
          <p className="text-xs text-yellow-500 leading-relaxed">{t('irrelevantWarning')}</p>
        </div>
      )}

      {/* AI summary (read-only) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1.5">
            {t('summaryLabel')}
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{draft.summary}</p>
        </div>

        {draft.missingInformation.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
              {t('missingLabel')}
            </p>
            <ul className="space-y-1">
              {draft.missingInformation.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-yellow-500">
                  <span className="mt-0.5">△</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Editable classification */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          {t('editableTitle')}
        </p>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
            {t('categoryLabel')}
          </label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as Category)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-600 appearance-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Target entity */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
            {t('entityLabel')}
          </label>
          <input
            type="text"
            value={targetEntity}
            onChange={(e) => onEntityChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-600 font-mono"
          />
        </div>

        {/* Evidence tier */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
            {t('tierLabel')}
          </label>
          <select
            value={evidenceTier}
            onChange={(e) => onTierChange(e.target.value as EvidenceTier)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-600 appearance-none"
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier} className={tierColor(tier)}>
                {tier}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${tierDotColor(evidenceTier)}`} />
            <span className={`text-xs font-medium ${tierColor(evidenceTier).split(' ')[0]}`}>
              {evidenceTier}
            </span>
          </div>
        </div>
      </div>

      {/* Wallet address */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
          {t('walletLabel')}
        </label>
        <input
          type="text"
          required
          value={walletAddress}
          onChange={(e) => onWalletChange(e.target.value)}
          placeholder="0x…"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-700 font-mono"
        />
        <p className="text-xs text-slate-700">{t('walletHint')}</p>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={confirming || !walletAddress.trim() || !targetEntity.trim()}
        className="w-full py-3 rounded-lg text-sm font-semibold bg-blue-900 text-blue-200 border border-blue-800 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {confirming ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            {t('confirmingBtn')}
          </span>
        ) : (
          t('confirmBtn')
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmed result
// ---------------------------------------------------------------------------

function ConfirmedView({
  result,
  t,
}: {
  result: ConfirmedResult;
  t: ReturnType<typeof useTranslations<'submit.result'>>;
}) {
  const { analysis, fileHash, txHash } = result;
  return (
    <div className="bg-slate-900 border border-emerald-900 rounded-lg overflow-hidden">
      <div className="bg-emerald-950/60 border-b border-emerald-900 px-5 py-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-medium text-emerald-400">{t('onChainBanner')}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="px-2.5 py-1 rounded text-xs font-medium bg-cyan-950 text-cyan-400 border border-cyan-800">
            ⚖ {analysis.targetEntity}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${tierColor(analysis.evidenceTier)}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tierDotColor(analysis.evidenceTier)}`} />
            {analysis.evidenceTier}
          </span>
          <span className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            {analysis.category}
          </span>
        </div>

        {/* Summary */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{t('aiSummary')}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{analysis.summary}</p>
        </div>

        {/* Missing info */}
        {analysis.missingInformation.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{t('missingInfo')}</p>
            <ul className="space-y-1">
              {analysis.missingInformation.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-yellow-500">
                  <span className="mt-0.5">△</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* On-chain proof */}
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">{t('onChainProof')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-600 w-20 shrink-0 pt-0.5">{t('fileHash')}</span>
              <span className="font-mono text-xs text-slate-400 break-all">{fileHash}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-600 w-20 shrink-0 pt-0.5">{t('txHash')}</span>
              <span className="font-mono text-xs text-emerald-500 break-all">{txHash}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message, t }: { message: string; t: ReturnType<typeof useTranslations<'submit.result'>> }) {
  return (
    <div className="bg-red-950/40 border border-red-900 rounded-lg p-5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm font-medium text-red-400">{t('failedBanner')}</span>
      </div>
      <p className="text-sm text-red-600">{message}</p>
    </div>
  );
}

function DuplicateBanner({ fileHash, t }: { fileHash: string; t: ReturnType<typeof useTranslations<'submit.result'>> }) {
  return (
    <div className="bg-yellow-950/40 border border-yellow-900 rounded-lg p-5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-sm font-medium text-yellow-400">{t('duplicateBanner')}</span>
      </div>
      <p className="font-mono text-xs text-yellow-800 break-all">{fileHash}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubmitPage() {
  const t = useTranslations('submit');
  const tc = useTranslations('common');
  const tUpload = useTranslations('submit.upload');
  const tReview = useTranslations('submit.review');
  const tResult = useTranslations('submit.result');

  const [phase, setPhase] = useState<Phase>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<DraftAnalysis | null>(null);

  // Editable classification fields (initialised from draft, user may modify)
  const [editCategory, setEditCategory] = useState<Category>('Side Effect Withholding');
  const [editEntity, setEditEntity] = useState('');
  const [editTier, setEditTier] = useState<EvidenceTier>('Tier 4: Anecdotal');

  const [walletAddress, setWalletAddress] = useState('');
  const [confirmedResult, setConfirmedResult] = useState<ConfirmedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateHash, setDuplicateHash] = useState<string | null>(null);

  // ---- Handlers -----------------------------------------------------------

  function handleFileSelect(file: File) {
    setSelectedFile(file);
    setError(null);
  }

  async function handleAnalyze() {
    if (!selectedFile) return;
    setPhase('analyzing');
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/evidence/intake', { method: 'POST', body: formData });
      const data = await res.json() as { analysis?: DraftAnalysis; error?: string; message?: string };

      if (!res.ok) {
        setError(data.message ?? `Request failed with status ${res.status}`);
        setPhase('upload');
        return;
      }

      const analysis = data.analysis!;
      setDraft(analysis);
      setEditCategory(analysis.category);
      setEditEntity(analysis.targetEntity);
      setEditTier(analysis.evidenceTier);
      setPhase('review');
    } catch {
      setError('Could not reach the backend. Is the server running?');
      setPhase('upload');
    }
  }

  async function handleConfirm() {
    if (!selectedFile || !draft) return;
    setPhase('confirming');
    setError(null);
    setDuplicateHash(null);

    const approvedAnalysis: DraftAnalysis = {
      ...draft,
      category: editCategory,
      targetEntity: editEntity,
      evidenceTier: editTier,
    };

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('analysis', JSON.stringify(approvedAnalysis));
    formData.append('submitterAddress', walletAddress);

    try {
      const res = await fetch('/api/evidence/confirm', { method: 'POST', body: formData });
      const data = await res.json() as {
        relevant?: boolean;
        fileHash?: string;
        txHash?: string;
        analysis?: DraftAnalysis;
        error?: string;
        message?: string;
      };

      if (res.status === 409 && data.error === 'duplicate') {
        setDuplicateHash(data.fileHash ?? '');
        setPhase('review');
        return;
      }

      if (!res.ok) {
        setError(data.message ?? `Request failed with status ${res.status}`);
        setPhase('review');
        return;
      }

      setConfirmedResult({
        fileHash: data.fileHash!,
        txHash: data.txHash!,
        analysis: data.analysis!,
      });
      setPhase('confirmed');
    } catch {
      setError('Could not reach the backend. Is the server running?');
      setPhase('review');
    }
  }

  function handleReset() {
    setPhase('upload');
    setSelectedFile(null);
    setDraft(null);
    setError(null);
    setDuplicateHash(null);
    setConfirmedResult(null);
  }

  // ---- Render -------------------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
              {t('backLink')}
            </Link>
            <span className="text-slate-800">|</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-100 uppercase">
              {t('pageTitle')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* ── Phase: upload ─────────────────────────────────────────── */}
        {(phase === 'upload' || phase === 'analyzing') && (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <h1 className="text-sm font-semibold text-slate-300 mb-2">{tUpload('heading')}</h1>
              <p className="text-sm text-slate-500 leading-relaxed">{tUpload('body')}</p>
            </div>

            <UploadZone selectedFile={selectedFile} onFileSelect={handleFileSelect} t={tUpload} />

            {error && (
              <div className="bg-red-950/40 border border-red-900 rounded-lg p-4">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || phase === 'analyzing'}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-blue-900 text-blue-200 border border-blue-800 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {phase === 'analyzing' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  {tUpload('analyzingBtn')}
                </span>
              ) : (
                tUpload('analyzeBtn')
              )}
            </button>

            {phase === 'analyzing' && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                <AnalyzingSkeleton />
              </div>
            )}
          </>
        )}

        {/* ── Phase: review / confirming ────────────────────────────── */}
        {(phase === 'review' || phase === 'confirming') && draft && (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <h1 className="text-sm font-semibold text-slate-300 mb-2">{tReview('heading')}</h1>
              <p className="text-sm text-slate-500 leading-relaxed">{tReview('body')}</p>
            </div>

            {duplicateHash && <DuplicateBanner fileHash={duplicateHash} t={tResult} />}
            {error && <ErrorBanner message={error} t={tResult} />}

            <ReviewPanel
              draft={draft}
              category={editCategory}
              targetEntity={editEntity}
              evidenceTier={editTier}
              walletAddress={walletAddress}
              onCategoryChange={setEditCategory}
              onEntityChange={setEditEntity}
              onTierChange={setEditTier}
              onWalletChange={setWalletAddress}
              onConfirm={handleConfirm}
              onReset={handleReset}
              confirming={phase === 'confirming'}
              t={tReview}
              tc={tc}
            />
          </>
        )}

        {/* ── Phase: confirmed ──────────────────────────────────────── */}
        {phase === 'confirmed' && confirmedResult && (
          <>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                {tResult('title')}
              </p>
              <ConfirmedView result={confirmedResult} t={tResult} />
            </div>

            <button
              onClick={handleReset}
              className="w-full py-2.5 rounded-lg text-xs font-medium text-slate-500 border border-slate-800 hover:bg-slate-900 hover:text-slate-300 transition-colors"
            >
              {tUpload('analyzeBtn')} →
            </button>
          </>
        )}

      </div>
    </main>
  );
}
