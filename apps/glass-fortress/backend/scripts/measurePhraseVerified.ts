/**
 * How often does a model attribute to a record what it does not say?
 *
 *   npm run forensics:measure-phrase-verified -- --env <env>
 *
 * THE MEASUREMENT THESIS FLOWS §13 `:1204` ASKS FOR, and A7 `:1667` names: "`phraseVerified: ABSENT` over assessments
 * and analyses" — the stock-phrase defect, counted. It lands at thesis step 22, the step that gives it its second
 * subject, the critic's analyses (the researcher's ruling of 2026-09-12; R48 §6-5).
 *
 * READ-ONLY. One SELECT over framing rounds of type ASSESSED and one over analyses. It writes nothing, calls no model,
 * and touches no chain.
 *
 * THE COUNTING IS NOT HERE. `src/lib/phraseVerifiedRate.ts` holds it as a pure function, and
 * `test/phraseVerifiedRate.test.ts` is where it is OBSERVED TO FAIL; `test/operationalScriptsGuarded.test.ts` holds that
 * no script invents a second way in.
 *
 * COMPILED, NOT INTERPRETED — `node dist/scripts/measurePhraseVerified.js` after `npm run build` (CLAUDE.md). The
 * environment is stated TWICE: once to Railway, once to this script as `--env`.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { runOperationalScript } from '../src/lib/operationalContext';
import { formatPhraseVerifiedRate, phraseVerifiedRate, type PhraseVerifiedRow } from '../src/lib/phraseVerifiedRate';

async function main(): Promise<void> {
  const rounds = await prisma.framingRound.findMany({ where: { type: 'ASSESSED' }, select: { content: true } });
  const analyses = await prisma.thesisAnalysis.findMany({ select: { opinion: true } });

  const rows: PhraseVerifiedRow[] = [
    ...rounds.map((r): PhraseVerifiedRow => ({ source: 'ASSESSMENT', content: r.content })),
    ...analyses.map((a): PhraseVerifiedRow => ({ source: 'ANALYSIS', content: a.opinion })),
  ];
  const report = phraseVerifiedRate(rows);

  console.log("THE MODELS' ABSENT-PHRASE RATE — thesis flows §13, A7\n");
  console.log(formatPhraseVerifiedRate(report));

  if (report.total.rate === null) {
    // A PASS THAT EXAMINED NOTHING SAYS ZERO, NEVER NOTHING (A7 :1656–:1657).
    console.log(
      '\nNo assertion of an assessor or the critic has been checked in this environment, so there is no rate to ' +
        'report. This is not a measurement of zero misattribution.',
    );
    return;
  }

  console.log(
    '\nNothing gates on this number. It counts how often a model named a phrase the record does not carry — the ' +
      'stock-phrase defect three models reproduced on one page (docs/gf-framing-assessor-defects.md).',
  );
}

void runOperationalScript(main);
