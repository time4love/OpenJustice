# The rebuild on production, steps 3 and 4 — the NEW REGISTRY on Base mainnet and the configuration rotated — 2026-09-13

**Refactor plan §3 step 9, sub-steps 3 and 4, on PRODUCTION; evidence flows §8.** A fresh
`EvidenceRegistry` on Base mainnet, unchanged source, deployed by the researcher with production's
registrar key from their machine — never through MCP, never by the session — and production's
configuration turned to it. Steps 1 and 2 preceded it: `docs/gf-rebuild-production-measure-2026-09-13.md`,
`docs/gf-rebuild-production-ledger-2026-09-13.md`. Staging rehearsed the same two acts on 2026-09-06
(`docs/gf-rebuild-staging-new-registry-2026-09-06.md`). **THIS IS THE ONE-SHOT MAINNET ACT** evidence
flows §8 names: a second contract on Base, taken once, for the reason the design states — the old
contract holds 20 entries and not one is a `documentHash`. Every value here is read from the chain or
from the broadcast record with `cast`, pasted raw to `handoffs/P1-deploy-reads-2026-09-13.txt` and
`P1-mainnet-pre-reads-2026-09-13.txt` (outside this repository) and quoted from them.

## 1 — step 3: the deploy

**Before the key was touched**, read against `https://mainnet.base.org` with no key: chain id 8453; the
registrar `0x19a4385405643682607c78d7e5c3a940ba2cccc8` (every old entry's submitter, the measure doc §4)
held **0.000979 ETH** at nonce 20; the old registry's runtime bytecode, sha256 `9443166e…c668d`, equal to
the compiled artifact's `deployedBytecode` (`forge build`: "No files changed, compilation skipped");
the address a deploy from that nonce would take, `0xDE42…9823`.

**The researcher's act**, from `contracts/`, by `handoffs/P1-deploy.sh` — `R27-deploy.sh` with the RPC
passed as a URL (`foundry.toml` declares no mainnet alias), the expected deployer changed to production's
registrar, and a stop if the pasted key derives to any other address. The key was prompted silently,
lived in that process only, and was unset on exit; no file holds it. The dry run
(`P1-deploy-dry-run-2026-09-13.txt`) printed `Chain ID: 8453` and `Deployer address: 0x19A4…cCC8`,
predicted the address from the nonce, estimated 924,618 gas; the researcher typed `yes`; the broadcast
(`P1-deploy-broadcast-2026-09-13.txt`) landed exactly at the predicted address.

| fact | value, read from the chain |
|---|---|
| new registry | **`0xDE42950373BCd0bcb9232aa01745C0bBbf409823`**, Base mainnet (8453) |
| deploying transaction | `0xa2c1e7d55185d84ec273a0a6d12b2aad29a58ca9e896dc909dde873112cab8ee`, block 51,258,456, status 1, gas used 711,245 |
| deployer = registrar | `0x19a4385405643682607c78d7e5c3a940ba2cccc8`, nonce 20 → 21 |
| cost | 0.0000038 ETH — 711,245 gas at 5.375 gwei plus an L1 data fee of 0.00000001 ETH; balance 0.000979 → 0.000975 ETH |
| broadcast record | `contracts/broadcast/DeployEvidenceRegistry.s.sol/8453/run-latest.json`, gitignored; `git status` on `contracts/` empty |

**The acceptance reads (evidence flows §8), each against `https://mainnet.base.org`, 13:31Z:**

| read | result |
|---|---|
| `cast chain-id` | `8453` |
| `cast code <new>` | 5,600 hex chars, sha256 `9443166e7d01a346b009a06778acdc1c855ee25dc3ceb955b2d65bd73b0c668d` — **byte-identical to the OLD registry's runtime bytecode and to the compiled artifact**, metadata hash included |
| `cast call <new> 'totalEvidence()(uint256)'` | **`0`** |
| `cast call <new> 'hasRole(bytes32,address)(bool)' $(cast keccak REGISTRAR_ROLE) 0x19a4…ccc8` | **`true`** (`REGISTRAR_ROLE` = `0xedcc084d…309238`); `DEFAULT_ADMIN_ROLE` also `true` |
| `cast call <new> 'getEvidence(uint256)' 0` | reverts with `0x431e6b77…` = `EvidenceNotFound(uint256)` — no entry exists |
| `cast receipt <tx>` | `status 1`, `contractAddress` = the new address, `from` = the registrar |
| the old registry | `totalEvidence()` still 20, code in place, explained index by index in the ledger |

The same source under the same compiler settings, twice, proven on chain. The constructor granted both
roles to the deployer, and the deployer is the registrar, so no `grantRole` was needed and none was sent.

**The registrar's wallet is thin.** 0.000975 ETH remains. Every anchor of the production walk
(sub-step 6, session 3) spends from the same key on mainnet; topping it up before session 3 is the
researcher's call, recorded here so it is not discovered at the first ACQUIRED capture.

## 2 — step 4: the rotation

**The researcher's act**, in the Railway dashboard: production → `glass-fortress-backend` → Variables →
`EVIDENCE_REGISTRY_ADDRESS` = `0xDE42950373BCd0bcb9232aa01745C0bBbf409823`. One variable on one service:
the frontend neither reads the variable nor carries it (checked by name, never by value). Railway
redeployed the backend on the change — deployment `25a6ebcd`, created 13:33:09Z, same commit `0ca8d72`,
**SUCCESS** at 13:35Z (`P1-rotation-deploy-poll-2026-09-13.txt`) — and the reads below are against that
container. The old address is in no configuration and on no path that reads a registry: it names the
ledger file, its `successor` field, and nothing in code (`ORPHANED_BY_REGISTRY` carries no production
key) — so no path can consult two registries.

**The acceptance, quoted** (`P1-read-registry-after-rotation-2026-09-13.txt`,
`P1-cast-after-rotation-2026-09-13.txt`). `get_environment` is the MCP acceptance and the production
connector is disconnected by precondition, so the in-container read and the `cast` read are the
acceptance here; `get_environment` is read at session 3, after the connector's re-authorization.

| check | return |
|---|---|
| `forensics:read-registry --env production`, 13:35:46Z | the guard's banner — *environment production — agreed by Railway, APP_ENV, the database and the chain*, deployment `25a6ebcd @ 0ca8d72` (the chain axis still 8453, the new address holding code); `registry 0xDE42950373BCd0bcb9232aa01745C0bBbf409823`; `registrar 0x19a4…ccc8`; **`totalEvidence() 0`**; every legacy row NEITHER — 83 snapshots, 8 evidence rows, 174 claims UNREGISTERED |
| `cast call <new> 'totalEvidence()(uint256)'` at 13:35:57Z | `0` |
| `cast call <old> 'totalEvidence()(uint256)'` | `20` |

**That discrepancy is the proof**: the service is on the new contract, which holds nothing, and the
database's 91 legacy claims are held by a registry the service no longer reads. Every tool on production
that asks the chain now answers from an empty registry until the drop — the state evidence flows §8
designs for between sub-steps 4 and 5, not a finding; the cleanup session ends it. The ledger's
`successor` is set to the new address in the same commit as this document — the one edit the emitted
file ever receives, one line, and the committed-file test still holds it complete.

## 3 — the freeze, restated

**No write tool and no `--apply` script that reaches the chain runs on production between this rotation
and session 3's head deploy.** Production at `0ca8d72` does not carry the `WRITES_ALLOWED` refusal —
head does — so the rule is the written one, bounded exactly as staging's was (measure doc §5, ruled
2026-09-06). The production MCP connector stays disconnected for the duration. The new registry's index
zero is written by the first ACQUIRED capture of the production walk, stamped with the anchoring scheme;
anything anchored before that would put a first entry on the registry that carries no scheme, and the
refusal `WRITES_ALLOWED` would then hold it shut forever.

## 4 — what the cleanup session (session 2) takes from this

The three records of THE BACKUP exist: Supabase's restore-only backup of 2026-09-13 05:38:06 UTC; the
chain-id export (88,659 bytes, sha256 `df329ee8…4033`); the ledger, committed. The new registry holds
nothing and the configuration names it. Nothing below sub-step 5 is blocked. The drop is session 2's, in
full, under `CLAUDE.md`'s protocol: `handoffs/P2-production-cleanup-prompt.md`.

Bears on: refactor plan §3 step 9.
