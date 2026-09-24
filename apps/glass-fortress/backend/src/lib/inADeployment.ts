// ---------------------------------------------------------------------------
// WHETHER THIS PROCESS IS A RUNNING DEPLOYMENT — one pure read of the environment it is handed.
//
// `RAILWAY_DEPLOYMENT_ID` is set only inside a running deployment: absent on a laptop, absent under
// `railway run`. Two rules read it, and they read it HERE so that there is one spelling:
//
//   - an operational script runs only inside a deployment (CLAUDE.md, "Enforced, not requested");
//   - a chain WRITE is sent only from inside a deployment (document step 31, Q8 as ruled 2026-09-24): the
//     anchoring module's environment-built client refuses one anywhere else, and the act completes owed.
//
// The environment is an ARGUMENT, never read from `process.env` here, so the check is pure and each caller
// says which environment it means. A type predicate, so a caller that needs the id reads it narrowed rather
// than re-testing it.
// ---------------------------------------------------------------------------

export function inADeployment(env: NodeJS.ProcessEnv): env is NodeJS.ProcessEnv & { RAILWAY_DEPLOYMENT_ID: string } {
  const id = env.RAILWAY_DEPLOYMENT_ID;
  return id !== undefined && id !== '';
}
