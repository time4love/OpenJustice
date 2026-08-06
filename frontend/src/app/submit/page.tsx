'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntakeAnalysis {
  isRelevant: boolean;
  category: string;
  summary: string;
  missingInformation: string[];
  targetEntity: string;
  evidenceTier: string;
}

interface IntakeSuccess {
  relevant: true;
  fileHash: string;
  txHash: string;
  analysis: IntakeAnalysis;
}

interface IntakeIrrelevant {
  relevant: false;
  message: string;
  analysis: IntakeAnalysis;
}

interface IntakeDuplicate {
  error: 'duplicate';
  message: string;
  fileHash: string;
}

interface IntakeError {
  error: string;
  message: string;
}

type IntakeResult = IntakeSuccess | IntakeIrrelevant | IntakeDuplicate | IntakeError;

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
// Result display components
// ---------------------------------------------------------------------------

function SuccessResult({ result }: { result: IntakeSuccess }) {
  const { analysis, fileHash, txHash } = result;

  return (
    <div className="bg-slate-900 border border-emerald-900 rounded-lg overflow-hidden">
      {/* Banner */}
      <div className="bg-emerald-950/60 border-b border-emerald-900 px-5 py-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-medium text-emerald-400">Evidence Registered On-Chain</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Entity + Tier + Category */}
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
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">AI Summary</p>
          <p className="text-sm text-slate-300 leading-relaxed">{analysis.summary}</p>
        </div>

        {/* Missing information */}
        {analysis.missingInformation.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
              Missing Information
            </p>
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
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">On-Chain Proof</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-600 w-20 shrink-0 pt-0.5">File Hash</span>
              <span className="font-mono text-xs text-slate-400 break-all">{fileHash}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-600 w-20 shrink-0 pt-0.5">Tx Hash</span>
              <span className="font-mono text-xs text-emerald-500 break-all">{txHash}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IrrelevantResult({ result }: { result: IntakeIrrelevant }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className="bg-slate-800/60 border-b border-slate-700 px-5 py-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        <span className="text-sm font-medium text-slate-400">Evidence Analysed — Not Relevant</span>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-slate-400">{result.message}</p>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">AI Summary</p>
          <p className="text-sm text-slate-500 leading-relaxed">{result.analysis.summary}</p>
        </div>
      </div>
    </div>
  );
}

function DuplicateResult({ result }: { result: IntakeDuplicate }) {
  return (
    <div className="bg-yellow-950/40 border border-yellow-900 rounded-lg p-5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-sm font-medium text-yellow-400">Duplicate Submission</span>
      </div>
      <p className="text-sm text-yellow-600">{result.message}</p>
      <p className="font-mono text-xs text-yellow-800 break-all">{result.fileHash}</p>
    </div>
  );
}

function ErrorResult({ result }: { result: IntakeError }) {
  return (
    <div className="bg-red-950/40 border border-red-900 rounded-lg p-5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm font-medium text-red-400">Submission Failed</span>
      </div>
      <p className="text-sm text-red-600">{result.message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubmitPage() {
  const [rawText, setRawText] = useState('');
  const [submitterAddress, setSubmitterAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setIntakeResult(null);

    try {
      const res = await fetch('/api/evidence/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, submitterAddress }),
      });

      const data = (await res.json()) as IntakeResult;
      setIntakeResult(data);
    } catch {
      setIntakeResult({
        error: 'network',
        message: 'Could not reach the backend. Is the server running?',
      });
    } finally {
      setLoading(false);
    }
  }

  function isDuplicate(r: IntakeResult): r is IntakeDuplicate {
    return 'error' in r && (r as IntakeDuplicate).error === 'duplicate';
  }
  function isError(r: IntakeResult): r is IntakeError {
    return 'error' in r && (r as IntakeError).error !== 'duplicate';
  }
  function isSuccess(r: IntakeResult): r is IntakeSuccess {
    return 'relevant' in r && r.relevant === true;
  }
  function isIrrelevant(r: IntakeResult): r is IntakeIrrelevant {
    return 'relevant' in r && r.relevant === false;
  }

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
              ← Vault
            </Link>
            <span className="text-slate-800">|</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-100 uppercase">
              Submit Evidence
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Instructions */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
          <h1 className="text-sm font-semibold text-slate-300 mb-2">Evidence Intake</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Paste the full text of your evidence document below. Our AI Legal Analyst will classify
            it, assign an evidence tier, and — if relevant — register a tamper-proof hash on the
            blockchain as permanent proof of existence.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Raw text */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
              Evidence Text
            </label>
            <textarea
              required
              rows={12}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the full text of the document, email, memo, or social media post here…"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-700 resize-y font-mono leading-relaxed"
            />
          </div>

          {/* Submitter address */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
              Your Wallet Address
            </label>
            <input
              required
              type="text"
              value={submitterAddress}
              onChange={(e) => setSubmitterAddress(e.target.value)}
              placeholder="0x…"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-700 font-mono"
            />
            <p className="text-xs text-slate-700">
              Used for attribution only. Your identity is not stored on-chain.
            </p>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading || !rawText.trim() || !submitterAddress.trim()}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-blue-900 text-blue-200 border border-blue-800 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                Analysing evidence…
              </span>
            ) : (
              'Analyse & Register Evidence'
            )}
          </button>
        </form>

        {/* Result */}
        {intakeResult && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Analysis Result
            </p>
            {isSuccess(intakeResult) && <SuccessResult result={intakeResult} />}
            {isIrrelevant(intakeResult) && <IrrelevantResult result={intakeResult} />}
            {isDuplicate(intakeResult) && <DuplicateResult result={intakeResult} />}
            {isError(intakeResult) && <ErrorResult result={intakeResult} />}
          </div>
        )}
      </div>
    </main>
  );
}
