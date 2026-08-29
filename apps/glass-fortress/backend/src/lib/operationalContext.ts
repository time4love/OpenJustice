import { EXPECTED_CHAIN_ID, readChainIdentity } from './chainIdentity';
import { assertEnvironmentIdentity, maskProjectRef, type AppEnv } from './appEnv';
import { identifyEnvironment } from './dbEnvironment';

// ---------------------------------------------------------------------------
// WHERE AN OPERATIONAL SCRIPT MAY RUN, AND WHAT IT MUST AGREE WITH FIRST.
//
// On 2026-08-29 a local `forensics:backfill-anchor-checks` run read PRODUCTION's
// database and STAGING's chain, and wrote 91 integrity verdicts into production
// that do not mean what they say. `.env.production.local` defined DATABASE_URL
// and no chain variables at all; dotenv never overrides an already-set variable,
// so the database was pinned to production and the application's own `.env`
// filled the chain gaps from staging. Two internally valid halves, one invalid
// whole, no error, full confidence.
//
// THE DATABASE WAS CONFIRMED BY DATA ON EVERY RUN, correctly, and it did not
// help: the run confirmed one axis while the failure was on another. A
// confirmation line naming the axis you checked reads as proof about the axis
// you didn't.
//
// Two properties, in the order they matter.
//
// 1. THE ENVIRONMENT ARRIVES WHOLE, OR NOT AT ALL.
//
//    `RAILWAY_DEPLOYMENT_ID` is set only inside a running deployment — absent on
//    a laptop and absent under `railway run`. Requiring it is not a preference
//    for a nicer runner; it is what makes the incident's failure mode
//    unconstructible. Railway supplies every variable of an environment or none,
//    so the database and the chain can no longer come from different places, and
//    there is no partial credential file left for dotenv to fill the gaps
//    around.
//
//    Two further properties follow from the same fact, and nobody has to
//    remember either: the container is built from `master`, so "fix real data
//    with landed code only" becomes an attribute of the runner rather than a
//    rule; and `RAILWAY_GIT_COMMIT_SHA` names the exact commit, so an
//    operational write can record what produced it.
//
// 2. THE ENVIRONMENT IS STATED TWICE, AND CROSS-EXAMINED.
//
//    `railway ssh --environment X` is a human assertion exactly as
//    `.env.production.local` was, and a typo still connects you somewhere you
//    did not mean. So every operational script also takes a required `--env`,
//    and this module compares that declaration against everything the container
//    independently knows about itself. To defeat it you would have to make the
//    SAME mistake twice, in two different places, consistently.
//
//    That is the property the old rule lacked, and it is not merely "more
//    checks". The old failure was INCOHERENT — production's database with
//    staging's chain, a state no flag described, each half internally valid,
//    undetectable on any single axis. A wrong `--environment` is COHERENT:
//    everything arrives from one place, so every axis agrees with every other
//    and disagrees only with the operator. Coherent-and-wrong is catchable.
//    Incoherent-and-confident is not.
//
// EVERY AXIS, FOR EVERY SCRIPT — including the chain, and including scripts that
// never touch a chain. A per-script "does this one need the chain axis?" flag
// would be one rule with twenty implementations, which is this repository's
// dominant defect shape; and the script that got the flag wrong would be the one
// that needed it. The cost is that an RPC outage refuses an unrelated script,
// loudly, with a message saying so. That is the correct direction to fail for a
// corpus whose integrity claims are chain-anchored.
//
// WHAT THIS DELIBERATELY DOES NOT CHECK. An earlier draft of the policy listed a
// fifth voice: a TrackedUrl id known to exist in one environment and not the
// other. It is not implemented, because environment identity derived from
// CONTENT is precisely what `environmentIdentity.ts` was written to replace —
// every previous content-derived answer rotted, and a hand-maintained row id is
// the same shape as the corpus counts and the hand-copied fileHash that came
// before it. The four axes below change only when someone deliberately
// reconfigures a deployment.
// ---------------------------------------------------------------------------

/** What a script may rely on once the guard has passed. */
export interface OperationalContext {
  /** The declared environment, now agreed by every axis. */
  env: AppEnv;
  /** Railway's id for the running deployment — proof of where this ran. */
  deploymentId: string;
  /**
   * The commit the container was built from, for stamping onto what a script
   * writes. Null when Railway did not supply it, which is a gap in provenance
   * and never a reason to refuse: the environment is already whole by then.
   */
  commitSha: string | null;
}

/** Thrown for every refusal here, so a caller can report rather than stack-trace. */
export class OperationalContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationalContextError';
  }
}

const APP_ENVS: readonly AppEnv[] = ['production', 'staging'];

const NOT_IN_A_DEPLOYMENT =
  'Operational scripts run only inside a deployment.\n' +
  '  railway ssh --environment <env> --service <svc> ' +
  '"cd apps/glass-fortress/backend && npm run <script>"';

/**
 * Reads the required `--env`. Accepts `--env production` and `--env=production`.
 *
 * ABSENT IS A REFUSAL, never a default. A default would make the flag advisory,
 * and an advisory second statement of the environment cross-examines nothing —
 * it would agree with whatever the container said, which is the one thing it is
 * not for.
 */
export function readDeclaredEnv(argv: readonly string[]): AppEnv {
  const inline = argv.find((a) => a.startsWith('--env='));
  const positional = argv.indexOf('--env');
  const raw =
    inline !== undefined
      ? inline.slice('--env='.length)
      : positional !== -1
        ? argv[positional + 1]
        : undefined;

  if (raw === undefined || raw === '' || raw.startsWith('--')) {
    throw new OperationalContextError(
      `--env is required and must be one of ${APP_ENVS.join(' | ')}.\n` +
        'State the environment twice on purpose: once to Railway, saying where to connect, and\n' +
        'once here, declaring what you believe. A single wrong assertion is then detectable.',
    );
  }
  if (!APP_ENVS.includes(raw as AppEnv)) {
    throw new OperationalContextError(
      `--env must be one of ${APP_ENVS.join(' | ')}, got '${raw}'.`,
    );
  }
  return raw as AppEnv;
}

/** One voice's answer to "which environment is this?", or why it has none. */
interface Voice {
  name: string;
  /** What it says, or null when it cannot say — which is itself a refusal. */
  says: AppEnv | null;
  /** Shown when `says` is null, or when it disagrees. */
  detail: string;
}

/**
 * Every axis the container can speak from, EXCEPT the chain, which costs an RPC
 * round trip and is read separately so a failure there is reported as its own
 * kind of silence rather than as disagreement.
 */
function configurationVoices(env: NodeJS.ProcessEnv): Voice[] {
  const voices: Voice[] = [];

  const railway = env.RAILWAY_ENVIRONMENT_NAME;
  voices.push({
    name: 'RAILWAY_ENVIRONMENT_NAME',
    says: railway !== undefined && APP_ENVS.includes(railway as AppEnv) ? (railway as AppEnv) : null,
    detail:
      railway === undefined || railway === ''
        ? 'not set — Railway names every environment it runs, so this should be impossible here'
        : `'${railway}', which is not a known environment`,
  });

  // APP_ENV unset means production, matching the deployment: the variable is
  // deliberately absent from the production Railway services. Read through
  // getAppEnv's own rule rather than re-implementing that default here, because
  // two implementations of "unset means production" is how they come to disagree.
  let appEnvSays: AppEnv | null = null;
  let appEnvDetail = '';
  try {
    const identity = assertEnvironmentIdentity(env);
    appEnvSays = identity.appEnv;
    if (!identity.pinned) {
      appEnvSays = null;
      appEnvDetail =
        'EXPECTED_SUPABASE_PROJECT_REF is not set, so APP_ENV has never been checked against the ' +
        'database this deployment is actually connected to. An unpinned label is a ' +
        'self-declaration, and an operational script may not run on one.';
    }
  } catch (err) {
    appEnvDetail = err instanceof Error ? err.message : String(err);
  }
  voices.push({ name: 'APP_ENV (pinned to its database)', says: appEnvSays, detail: appEnvDetail });

  // The database speaks for itself, from the project ref inside DATABASE_URL —
  // the one axis that does not pass through APP_ENV at any point, and therefore
  // the only configuration voice that can contradict it.
  const database = identifyEnvironment(env);
  voices.push({
    name: 'DATABASE_URL project ref',
    says: database.appEnv,
    detail: !database.isUnrecognised
      ? `names ${database.label}`
      : database.ref === 'unknown'
        ? 'no Supabase project could be read from DATABASE_URL'
        : `names project ${maskProjectRef(database.ref)}, which is not a known environment`,
  });

  return voices;
}

/**
 * Refuses unless this is a real deployment AND every axis agrees with `--env`.
 *
 * Call it FIRST, before anything else awaits. Everything a script does after
 * this line is against a database and a chain that have both been named and
 * agreed; everything before it is against neither.
 */
export async function assertOperationalContext(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<OperationalContext> {
  const deploymentId = env.RAILWAY_DEPLOYMENT_ID;
  if (deploymentId === undefined || deploymentId === '') {
    throw new OperationalContextError(NOT_IN_A_DEPLOYMENT);
  }

  const declared = readDeclaredEnv(argv);

  const disagreements: string[] = [];
  for (const voice of configurationVoices(env)) {
    if (voice.says === null) {
      disagreements.push(`  ${voice.name} cannot say which environment this is: ${voice.detail}`);
    } else if (voice.says !== declared) {
      disagreements.push(`  ${voice.name} says '${voice.says}' — ${voice.detail}`);
    }
  }

  // THE AXIS THE INCIDENT TURNED ON, and the reason a database confirmation was
  // not enough. Read last because it is the only one that costs a round trip.
  const chain = await readChainIdentity(env);
  const expectedChainId = EXPECTED_CHAIN_ID[declared];
  if (!chain.reachable) {
    disagreements.push(
      `  the chain axis could not be read (${chain.error}), so nothing cross-checks the ` +
        'environment on the side where the consequences are permanent',
    );
  } else {
    if (chain.chainId !== expectedChainId) {
      disagreements.push(
        `  the RPC reports chain ${String(chain.chainId)}, but '${declared}' anchors to ` +
          String(expectedChainId),
      );
    }
    if (!chain.registryDeployed) {
      disagreements.push(
        `  no contract exists at EVIDENCE_REGISTRY_ADDRESS ${chain.registryAddress} on chain ` +
          `${String(chain.chainId)}. A transaction to a codeless address SUCCEEDS and returns a ` +
          'valid hash while anchoring nothing',
      );
    }
  }

  if (disagreements.length > 0) {
    throw new OperationalContextError(
      `Refusing to run: you declared --env ${declared}, and this deployment disagrees.\n\n` +
        `${disagreements.join('\n')}\n\n` +
        'One of the two is wrong. Do not resolve it by changing the flag until you know which.',
    );
  }

  return {
    env: declared,
    deploymentId,
    commitSha: env.RAILWAY_GIT_COMMIT_SHA ?? null,
  };
}

/**
 * The banner every operational script prints before it does anything.
 *
 * NAMES EVERY AXIS IT CHECKED, not just the one it happened to look at. The
 * previous banner said `target confirmed by data: PRODUCTION` and was true;
 * it was read as a statement about the environment, and the environment was
 * half staging.
 */
export function describeOperationalContext(context: OperationalContext): string {
  const commit = context.commitSha === null ? 'unknown commit' : context.commitSha.slice(0, 7);
  return (
    `environment  ${context.env} — agreed by Railway, APP_ENV, the database and the chain\n` +
    `deployment   ${context.deploymentId} @ ${commit}`
  );
}

/**
 * `argv` with the `--env` declaration removed.
 *
 * For the one script that reads its argument positionally: `db:simulate` joins
 * everything after `--` into the statement it simulates, so an un-stripped
 * `--env production` would be executed as part of the SQL. Every other script
 * reads named flags and is unaffected — but a shared helper is what stops the
 * next positional script from rediscovering this the hard way.
 */
export function withoutEnvFlag(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--env=')) continue;
    if (arg === '--env') {
      i += 1; // also drop its value
      continue;
    }
    out.push(arg);
  }
  return out;
}

/**
 * THE ONLY ENTRY POINT AN OPERATIONAL SCRIPT HAS.
 *
 * A wrapper rather than a guard each script remembers to call, because
 * "remembered by twenty callers" is this repository's dominant defect shape —
 * `scriptsLoadEnvFirst` exists because sixteen scripts implemented one rule and
 * four got it wrong, and three of those four WROTE. Here the script's body is a
 * value passed in, so it cannot run before the context is asserted: there is no
 * ordering to get wrong and nothing to opt out of.
 *
 * It also gives the refusal one voice. An OperationalContextError is printed as
 * its message and nothing else — the reader needs the sentence telling them how
 * to run it, not a stack trace through the module that noticed.
 */
export async function runOperationalScript(
  // `Promise<unknown>` so a script may resolve to nothing or to an exit code
  // without every caller restating the union. A NUMBER is taken as the exit
  // code; anything else means the script had none to give and a clean run exits
  // 0. `Promise<number | void>` would read better and is rejected by lint,
  // which is right — `void` in a union is a hole, not a type.
  body: (context: OperationalContext) => Promise<unknown>,
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  let context: OperationalContext;
  try {
    context = await assertOperationalContext(argv, env);
  } catch (err) {
    const message = err instanceof OperationalContextError ? err.message : String(err);
    console.error(`\n${message}\n`);
    process.exit(1);
  }

  console.log(`\n${describeOperationalContext(context)}\n`);

  try {
    const code = await body(context);
    if (typeof code === 'number') process.exit(code);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
