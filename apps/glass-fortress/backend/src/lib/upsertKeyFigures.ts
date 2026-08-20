import { prisma } from './prisma';

// Shared by every evidence-creation call site that extracts KeyFigure names from
// an IntakeOutput analysis — createMany + skipDuplicates makes this idempotent
// regardless of how many call sites reference the same figure concurrently.
export async function upsertKeyFigures(names: string[]): Promise<void> {
  if (names.length === 0) return;
  await prisma.keyFigure.createMany({
    data: names.map((name) => ({ name })),
    skipDuplicates: true,
  });
}
