# The rebuild on staging, steps 3 and 4 — the NEW REGISTRY deployed and the configuration rotated — 2026-09-06

**Refactor plan §3 step 9, sub-steps 3 and 4; evidence flows §8.** A fresh `EvidenceRegistry` on
Base Sepolia, unchanged source, deployed by the researcher with the registrar's own key from their
machine — never through MCP, never by the developer session — and staging's configuration turned to
it. Steps 1 and 2 preceded it: `docs/gf-rebuild-staging-measure-2026-09-06.md`,
`docs/gf-rebuild-staging-ledger-2026-09-06.md`. Every value here is read from the chain or from
the broadcast record with `cast` and `jq`, pasted raw to `handoffs/R27-deploy-reads-2026-09-06.txt`
(outside this repository) and quoted from it.

## 1 — step 3: the deploy

**The researcher's act**, from `contracts/`, the key in the shell for two commands and in no file:
a dry run without `--broadcast` (`handoffs/R27-deploy-dry-run-2026-09-06.txt`) read for its two
lines — `Chain ID: 84532`, `Deployer address: 0x9dE2e74b3C5dAC4C3e2A0D18A5B76eEac8989a28` — then
the broadcast (`handoffs/R27-deploy-broadcast-2026-09-06.txt`), then the key unset. The dry run
predicted the address from the deployer and its nonce (45); the broadcast landed exactly there.
Before it, the registrar held 0.029953 Sepolia ETH; the deploy cost 0.0000044.

| fact | value, read from the chain |
|---|---|
| new registry | **`0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`**, Base Sepolia (84532) |
| deploying transaction | `0x812f2809083cd042f3edcd2643bf97dc36001ce4d0b283cb435a40ec93c418ee`, block 46,459,768 (`0x2c4eb78`), status 1, gas 711,245 |
| deployer = registrar | `0x9de2e74b3c5dac4c3e2a0d18a5b76eeac8989a28`, nonce 45 → 46 |
| broadcast record | `contracts/broadcast/DeployEvidenceRegistry.s.sol/84532/run-1788687822443.json`, gitignored, commit `8917d70` |

**The acceptance reads (evidence flows §8), each against `https://sepolia.base.org`:**

| read | result |
|---|---|
| `cast chain-id` | `84532` |
| `cast code <new>` | 2799 bytes, `0x6080604052…` — code at the address |
| `cast call <new> 'totalEvidence()(uint256)'` | **`0`** |
| `cast call <new> 'hasRole(bytes32,address)(bool)' $(cast keccak REGISTRAR_ROLE) 0x9dE2…a28` | **`true`** (`REGISTRAR_ROLE` = `0xedcc084d…309238`); `DEFAULT_ADMIN_ROLE` also `true` |
| `cast call <new> 'getEvidence(uint256)(…)' 0` | reverts with `0x431e6b77…` = `EvidenceNotFound(uint256)` — no entry exists |
| `cast receipt <tx>` | `status 0x1`, `contractAddress` = the new address, `from` = the registrar |

**The source is unchanged, proven on chain.** `forge build` recompiled nothing and
`git status --short contracts/` is empty; and the new registry's runtime bytecode is byte-identical
to the compiled artifact's `deployedBytecode` and to the OLD registry's runtime bytecode, metadata
hash included — the same source under the same compiler settings, twice. The constructor granted
both roles to the deployer, and the deployer is the registrar (ruled 2026-09-06), so no `grantRole`
was needed and none was sent.

The old registry is untouched: 44 entries, its code in place, explained index by index in the
ledger; it is never written again by design, and the freeze rule below is what holds that until
step 5's refusal lands.

## 2 — step 4: the rotation

**The researcher's act**, in the Railway dashboard: staging → `glass-fortress-backend` → Variables →
`EVIDENCE_REGISTRY_ADDRESS` = `0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`. One variable on one
service: the frontend neither reads the variable nor carries it on staging (checked by name, never
by value), so the brief's "both GF services" reduced to one. Railway redeployed the backend on the
change — deployment `27987ab9`, 09:48:23Z, same commit `8917d70`, SUCCESS — and the reads below are
against that container. The old address is in no configuration and on no path that reads a
registry: it names the ledger file, its `successor` field, the emitter's per-registry ruling table
(`ORPHANED_BY_REGISTRY`) and three test fixtures — so no path can consult two registries.

**The acceptance, quoted (raw: `R27-environment-after-rotation-2026-09-06.json`,
`R27-check-on-chain-status-after-rotation-2026-09-06.json`, `R27-deploy-reads-2026-09-06.txt`):**

| check | return |
|---|---|
| `get_environment` | `environment: staging`, `verdict: CONFIRMED`, `chain.chainId: 84532`, `chain.registryAddress: 0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`, `chain.registryDeployed: true`, `matchesEnvironment: true`; corpus unchanged (112 snapshots, 9 evidence) |
| `cast call <new> 'totalEvidence()(uint256)'` at 09:50:25Z | `0` |
| `check_on_chain_status` on `0xf6e755b5…250441` (evidence `86ac5049…`, CONFIRMED on the old registry at index 22) | `verdict: UNANCHORED_CONFIRMED`, `chain.registered: false`, `consistent: false` — the database's claim is not held by the registry the service reads. **That discrepancy is the proof**: the service is on the new contract, which holds nothing. (The tool's explanation still ends "The registration is real", its `TX_UNREADABLE` wording; stale under a rotation, and it goes with the database.) |

**What the rotation makes true**, and what it does not. Every tool that asks the chain —
`check_on_chain_status`, `forensics:backfill-anchor-checks` — now answers from an empty registry, so
every legacy anchoring claim in the database reads as unregistered until the DROP.
`forensics:audit-anchors` reads stored verdicts and never the chain, so it says what it said this
morning until a new check is recorded; and `snapshotsUnanchored` in `get_environment` stays 0
because it counts `onChainTxHash IS NULL` (`src/services/environmentIdentity.ts`), not
registrations. None of that is a finding; it is the state evidence flows §8 designs for between
steps 4 and 5, and the cleanup session ends it. The ledger's `successor` is set to the new address
in the same commit as this document — the second commit the ruling of 2026-09-06 named — and the
committed-file test still holds it complete.

## 3 — the freeze, restated

Ruled 2026-09-06 (`docs/gf-rebuild-staging-measure-2026-09-06.md` §5): **no write tool and no
`--apply` script that reaches the chain runs on staging between the rotation and step 5's
landing.** The new registry's index zero is written by step 5's first ACQUIRED capture, stamped with
the anchoring scheme; the cleanup session surveys and does not anchor. Anything anchored before
that would put a first entry on the registry that carries no scheme, and the refusal
`WRITES_ALLOWED` would then hold it shut forever.

Bears on: refactor plan §3 step 9.
