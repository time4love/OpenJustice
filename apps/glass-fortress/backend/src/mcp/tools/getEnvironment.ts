import { describeEnvironment } from '../../services/environmentIdentity';

// ---------------------------------------------------------------------------
// get_environment
//
// The first call of any session, and the one nothing else could answer.
//
// A connector's NAME is not evidence — it is a label a client applied locally,
// and the production and staging connectors are indistinguishable from inside a
// conversation. Every substitute for this tool has been a content fingerprint
// maintained by hand in a document: an evidence count, then an article's
// fileHash. Both rotted, because content is what this platform exists to change.
//
// No parameters, deliberately. A question whose whole purpose is to establish
// where you are must not accept an argument that could presuppose the answer.
// ---------------------------------------------------------------------------

export const getEnvironmentSchema = {};

export async function getEnvironmentHandler(): Promise<string> {
  const report = await describeEnvironment();

  return JSON.stringify({
    ...report,
    explanation:
      '`environment` and `chain` are the answer; `corpus` is NOT. Counts and hashes change ' +
      'every time the platform is used, so any check keyed on them is a check with an expiry ' +
      'date — use the corpus to recognise an environment you already identified, never to ' +
      'identify one. `verdict: CONFIRMED` means the deployment\'s own APP_ENV was validated ' +
      'against the database it is connected to AND the chain its registry sits on agrees. ' +
      'UNVERIFIED means only one axis could be read. CONFLICT means the axes contradict each ' +
      'other — read `warnings` and write nothing until it is resolved.',
    ...(report.verdict === 'CONFLICT'
      ? {
          doNotWrite:
            'This environment contradicts itself. Evidence promotion is irreversible and ' +
            'on-chain: resolve the contradiction before any write tool is called.',
        }
      : {}),
  });
}
