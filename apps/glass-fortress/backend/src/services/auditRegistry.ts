import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../lib/anchoredCaptureHash';
import { classifyEntry, type CorpusHashes, type EntryKind, type RegistryState } from './registryState';

// ---------------------------------------------------------------------------
// `anchors-explainable` — `forensics:audit-registry`, evidence flows A7 :1268–:1273, EXTENDED by document flows A7
// :1554–:1556 at document step 31: "every entry's category ∈ { ANCHOR_SCHEME, DOCUMENT_COMMITMENT }; every commitment
// entry is reproduced by one Document row's (docId, salt); exit 1 on an unexplained entry, by index."
//
// FOUND AT DOCUMENT STEP 31, NOT BEFORE: the instrument evidence A7 names was never built; `forensics:read-registry`
// measures and exits 0, `forensics:registry-ledger` refuses with exit 2. This is it, over the LIVE registry.
//
// TWO RULES, TWO OWNERS. WHAT EXPLAINS A HASH is `classifyEntry`'s — CALLED, never re-spelled. WHICH CATEGORIES A LIVE
// REGISTRY MAY CARRY is this audit's: `classifyEntry` lets every category but DOCUMENT_COMMITMENT take the
// documentHash arm, so that a frozen registry's retired labels classify as they always did — and a LIVE entry with a
// third category whose hash happens to match a capture would read as explained by the join alone. A7 :1555 forbids
// exactly that entry, so it is checked here, first.
//
// A frozen registry's entries are explained by its COMMITTED ledger file, held complete in the suite by
// `registryLedgerCommitted.test.ts`; this audit reads the registry the deployment is configured with.
//
// PURE over state already read; the script is the one caller that reads.
// ---------------------------------------------------------------------------

const LIVE_CATEGORIES: readonly string[] = [ANCHOR_SCHEME, DOCUMENT_COMMITMENT];

export interface UnexplainedEntry {
  index: number;
  category: string;
  reason: string;
}

export interface RegistryAudit {
  examined: number;
  byKind: Partial<Record<Exclude<EntryKind, 'UNEXPLAINED'>, number>>;
  unexplained: UnexplainedEntry[];
}

export function auditRegistry(state: RegistryState, corpus: CorpusHashes): RegistryAudit {
  const byKind: RegistryAudit['byKind'] = {};
  const unexplained: UnexplainedEntry[] = [];
  for (const entry of state.entries) {
    if (!LIVE_CATEGORIES.includes(entry.category)) {
      unexplained.push({ index: entry.index, category: entry.category, reason: `category "${entry.category}" is neither ${LIVE_CATEGORIES.join(' nor ')}` });
      continue;
    }
    const classification = classifyEntry(entry, corpus);
    if (classification.kind === 'UNEXPLAINED') {
      unexplained.push({
        index: entry.index,
        category: entry.category,
        reason:
          entry.category === DOCUMENT_COMMITMENT
            ? 'no Document row’s (docId, salt) reproduces this commitment'
            : 'no capture holds this hash as its documentHash',
      });
      continue;
    }
    byKind[classification.kind] = (byKind[classification.kind] ?? 0) + 1;
  }
  return { examined: state.entries.length, byKind, unexplained };
}

/** exit 0: every live entry explained · exit 1: an unexplained entry, by index (evidence A7 :1272). */
export function exitCodeForRegistryAudit(audit: RegistryAudit): 0 | 1 {
  return audit.unexplained.length === 0 ? 0 : 1;
}

export function formatRegistryAudit(audit: RegistryAudit): string {
  const lines = [`anchors-explainable: ${String(audit.examined)} entries examined, ${String(audit.unexplained.length)} unexplained`];
  for (const [kind, n] of Object.entries(audit.byKind)) lines.push(`  ${kind.padEnd(22)} ${String(n)}`);
  for (const u of audit.unexplained) lines.push(`  UNEXPLAINED  index ${String(u.index)}  category "${u.category}" — ${u.reason}`);
  return lines.join('\n');
}
