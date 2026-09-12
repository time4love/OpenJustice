/**
 * How often does the framing assessor misquote the researcher?
 *
 *   npm run forensics:measure-assessor-verbatim -- --env <env>
 *
 * THE MEASUREMENT THESIS FLOWS §13 `:1203` ASKS FOR, and A7 `:1666` names: "the framing assessor's
 * verbatim rate — how often `researcherClaim` fails the substring check, on real rounds", because
 * it "decides whether 'flag, never drop' costs the researcher a round; the four legacy runs failed
 * it four times".
 *
 * IT LANDS AT THESIS STEP 19 BECAUSE THIS STEP GIVES IT ITS SUBJECT — thesis refactor plan §6
 * `:252–:253`, "the instruments of A7 land with the step that gives them a subject and are each
 * observed to fail first". Its sibling `forensics:measure-phrase-verified` reads "assessments AND
 * analyses"; analyses are step 22's, so half its subject does not exist yet and it waits.
 *
 * READ-ONLY. One SELECT over `FramingRound` rows of type ASSESSED. It writes nothing, calls no
 * model, and touches no chain.
 *
 * THE COUNTING IS NOT HERE. `src/lib/assessorVerbatimRate.ts` holds it as a pure function, and
 * `test/assessorVerbatimRate.test.ts` is where it is OBSERVED TO FAIL — the vacuity arm, and a
 * miscount over a fixture of known N and K. A script cannot run off a deployment, so a decoy
 * planted in this file could never be observed at all; what stays here is the query and the guard,
 * and `test/operationalScriptsGuarded.test.ts` holds that no script invents a second way in.
 *
 * COMPILED, NOT INTERPRETED — `node dist/scripts/measureAssessorVerbatim.js` after `npm run build`
 * (CLAUDE.md). The environment is stated TWICE: once to Railway, once to this script as `--env`.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { runOperationalScript } from '../src/lib/operationalContext';
import { formatVerbatimRate, verbatimRate } from '../src/lib/assessorVerbatimRate';

async function main(): Promise<void> {
  const rounds = await prisma.framingRound.findMany({
    where: { type: 'ASSESSED' },
    select: { framingId: true, sequence: true, content: true },
    orderBy: [{ framingId: 'asc' }, { sequence: 'asc' }],
  });

  const report = verbatimRate(rounds);

  console.log('THE FRAMING ASSESSOR\'S VERBATIM RATE — thesis flows §13, A7\n');
  console.log(formatVerbatimRate(report));

  if (report.rate === null) {
    // A PASS THAT EXAMINED NOTHING SAYS ZERO, NEVER NOTHING (A7 :1656–:1657). The
    // counts above already said zero; this says why there is no rate, so the
    // silence is never read as a clean result.
    console.log(
      '\nNo assessed framing round has been recorded in this environment, so there is no rate to ' +
        'report. This is not a measurement of zero misquotation.',
    );
    return;
  }

  console.log(
    '\nNothing gates on this number. It decides whether "flag, never drop" costs the researcher a ' +
      'round — the legacy runs failed the check four times out of four, on two corpora, five days ' +
      'apart (docs/gf-framing-assessor-defects.md).',
  );
}

void runOperationalScript(main);
