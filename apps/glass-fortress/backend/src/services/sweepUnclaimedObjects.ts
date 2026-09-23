import { prisma } from '../lib/prisma';
import { listObjects, removeObject } from './documentBucket';

// ---------------------------------------------------------------------------
// THE SWEEP OF UNCLAIMED OBJECTS — docs/gf-document-flows.md §9 :998 ("an object no row names is swept after a
// lifetime, an operational parameter of flows A8's kind"); R76 chunk-1 sketch §(c). Run by
// `scripts/sweepUnclaimedObjects.ts` inside a deployment, on demand.
//
// AN OBJECT IS UNCLAIMED IFF NO Document's `bytes` NAMES ITS KEY — held or cache by whether a row exists, derived and
// never a column (§12 :1185). It is DUE iff unclaimed AND older than the lifetime: the dialog's upload happens
// before the command runs, so a young unclaimed object may be a document about to arrive.
//
// IT LISTS BY DEFAULT. With `remove`, it RE-READS each due object's claim at the moment of removal and removes only
// what is still unclaimed — a document that arrived between the list and the delete is kept, and said so. It never
// touches a row, and its storage calls are `documentBucket`'s, the one storage module.
// ---------------------------------------------------------------------------

/** The lifetime of an unclaimed object — 7 days, RULED 2026-09-23 (operational, interaction A8's kind). */
export const SWEEP_LIFETIME_DAYS = 7;

export interface DueObject {
  key: string;
  size: number;
  ageDays: number;
}

export interface SweepReport {
  examined: number;
  due: DueObject[];
  swept: string[];
  /** Due at the list, claimed by the time of its removal — kept. */
  keptOnRecheck: string[];
}

const DAY_MS = 86_400_000;

async function claimed(key: string): Promise<boolean> {
  return (await prisma.document.findFirst({ where: { bytes: key }, select: { commitment: true } })) !== null;
}

export async function sweepUnclaimedObjects(options: {
  remove: boolean;
  now: Date;
  /** The suite's seam for the race the re-check exists for; the script passes nothing. */
  beforeEachRemoval?: (key: string) => Promise<void>;
}): Promise<SweepReport> {
  const objects = await listObjects();
  const due: DueObject[] = [];
  for (const object of objects) {
    const ageDays = (options.now.getTime() - object.createdAt.getTime()) / DAY_MS;
    if (ageDays <= SWEEP_LIFETIME_DAYS) continue;
    if (await claimed(object.key)) continue;
    due.push({ key: object.key, size: object.size, ageDays: Math.floor(ageDays) });
  }

  const swept: string[] = [];
  const keptOnRecheck: string[] = [];
  if (options.remove) {
    for (const object of due) {
      await options.beforeEachRemoval?.(object.key);
      if (await claimed(object.key)) {
        keptOnRecheck.push(object.key);
        continue;
      }
      await removeObject(object.key);
      swept.push(object.key);
    }
  }
  return { examined: objects.length, due, swept, keptOnRecheck };
}

export function formatSweep(report: SweepReport, removing: boolean): string {
  const lines = [
    `sweep-unclaimed-objects: ${String(report.examined)} objects, ${String(report.due.length)} unclaimed past ${String(SWEEP_LIFETIME_DAYS)} days` +
      (removing ? `, ${String(report.swept.length)} removed, ${String(report.keptOnRecheck.length)} kept on re-check` : ' — LISTED, nothing removed (--delete removes)'),
  ];
  for (const object of report.due) lines.push(`  DUE   ${object.key.slice(0, 18)}…  ${String(object.size)} bytes  ${String(object.ageDays)} days`);
  for (const key of report.keptOnRecheck) lines.push(`  KEPT  ${key.slice(0, 18)}…  claimed by a document since the list`);
  return lines.join('\n');
}
