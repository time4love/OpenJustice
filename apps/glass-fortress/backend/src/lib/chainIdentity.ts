import { ethers } from 'ethers';
import type { AppEnv } from './appEnv';

// ---------------------------------------------------------------------------
// Chain identity — read-only, and deliberately NOT Web3Service.
//
// Web3Service's constructor requires REGISTRAR_PRIVATE_KEY, because everything
// it does is signed. "Which chain am I on?" is not signed, and a deployment that
// cannot say which environment it is because a SIGNING key is missing has the
// dependency backwards: the question exists to be answered BEFORE anything is
// signed.
//
// This is the second independent axis of environment identity. APP_ENV is a
// label a deployment applies to itself; assertEnvironmentIdentity() checks that
// label against the database it is actually connected to. Neither can see the
// chain — and the chain is where the consequences are permanent. Production
// anchors to Base mainnet, staging to Base Sepolia. For a caller to be misled,
// the label, the database pin and the chain id would all have to be wrong in the
// same direction, which no single mistake produces.
// ---------------------------------------------------------------------------

/**
 * The chain each environment anchors evidence to.
 *
 * A hand-maintained constant, which is exactly what this module exists to
 * replace elsewhere — justified here because it is not DATA. Corpus counts and
 * content hashes change whenever the platform is used, so a check keyed on them
 * rots by design; the chain an environment anchors to changes only when someone
 * deliberately redeploys the registry, and that should break a test.
 */
export const EXPECTED_CHAIN_ID: Readonly<Record<AppEnv, number>> = {
  production: 8453, // Base mainnet
  staging: 84532, // Base Sepolia
};

export type ChainIdentity =
  | {
      reachable: true;
      chainId: number;
      registryAddress: string;
      /**
       * False means the configured address holds no code. Reported rather than
       * thrown: it is a finding, and the single most dangerous configuration
       * this platform has ever had — a transaction to a codeless address
       * SUCCEEDS and returns a valid hash while anchoring nothing.
       */
      registryDeployed: boolean;
    }
  | { reachable: false; registryAddress: string | null; error: string };

/** Milliseconds before an unresponsive RPC is reported as unreachable. */
const RPC_TIMEOUT_MS = 8_000;

/**
 * Reads chain identity without a wallet and without writing anything.
 *
 * Never throws. An RPC outage must degrade this to "chain axis unavailable",
 * never to "cannot determine environment" — the configuration axis still
 * answers the question, and a tool that fails closed on a third-party outage
 * would push callers back to guessing from the connector name.
 */
export async function readChainIdentity(
  env: Record<string, string | undefined> = process.env,
): Promise<ChainIdentity> {
  const rpcUrl = env.RPC_URL;
  const registryAddress = env.EVIDENCE_REGISTRY_ADDRESS ?? null;

  if (!rpcUrl) {
    return { reachable: false, registryAddress, error: 'RPC_URL is not set on this deployment.' };
  }
  if (!registryAddress) {
    return {
      reachable: false,
      registryAddress: null,
      error: 'EVIDENCE_REGISTRY_ADDRESS is not set on this deployment.',
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const [network, code] = await withTimeout(
      Promise.all([provider.getNetwork(), provider.getCode(registryAddress)]),
    );

    return {
      reachable: true,
      chainId: Number(network.chainId),
      registryAddress,
      registryDeployed: code !== '0x' && code !== '0x0',
    };
  } catch (error) {
    return {
      reachable: false,
      registryAddress,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            reject(new Error(`RPC did not respond within ${String(RPC_TIMEOUT_MS)}ms.`));
          },
          RPC_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
