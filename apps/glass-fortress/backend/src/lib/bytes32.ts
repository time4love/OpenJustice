/**
 * The 0x-prefixed form a bytes32 contract argument requires.
 *
 * This exists because two layers of this system store SHA-256 digests in
 * different formats. `Evidence.fileHash` comes from `ethers.sha256()` and carries
 * the prefix; `UrlSnapshot.contentHash` comes from `createHash('sha256').digest('hex')`
 * and does not. Passing the bare form to the registry throws INVALID_ARGUMENT.
 *
 * That is not hypothetical. Every snapshot anchoring attempt did exactly that,
 * in every environment, from the first scan onward — 83 of them — and the call
 * site swallowed the rejection, so a permanent defect was indistinguishable from
 * a chain that happened to be unreachable. See the researcher playbook,
 * FINDING 41.
 *
 * Call this at every chain boundary rather than normalising at rest: the stored
 * formats are load-bearing elsewhere, and a boundary conversion cannot be
 * forgotten by a future reader the way an assumed format can.
 */
export function toBytes32(hexDigest: string): string {
  return hexDigest.startsWith('0x') ? hexDigest : `0x${hexDigest}`;
}
