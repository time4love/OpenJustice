// Inlined from packages/evidence-registry-abi — canonical source for both apps.
// Update the shared package and re-inline here when the contract changes.
export const EVIDENCE_REGISTRY_ABI = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  { type: 'error', name: 'AccessControlBadConfirmation', inputs: [] },
  {
    type: 'error',
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'neededRole', type: 'bytes32' },
    ],
  },
  {
    type: 'error',
    name: 'DuplicateEvidence',
    inputs: [{ name: 'fileHash', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'EvidenceNotFound',
    inputs: [{ name: 'evidenceId', type: 'uint256' }],
  },
  { type: 'error', name: 'InvalidCategory', inputs: [] },
  { type: 'error', name: 'InvalidHash', inputs: [] },
  {
    type: 'event',
    name: 'EvidenceSubmitted',
    anonymous: false,
    inputs: [
      { name: 'fileHash', type: 'bytes32', indexed: true },
      { name: 'submitter', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'category', type: 'string', indexed: false },
      { name: 'evidenceId', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoleGranted',
    anonymous: false,
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RoleRevoked',
    anonymous: false,
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
    ],
  },
  {
    type: 'function',
    name: 'DEFAULT_ADMIN_ROLE',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'REGISTRAR_ROLE',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEvidence',
    inputs: [{ name: 'evidenceId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'fileHash', type: 'bytes32' },
          { name: 'submitter', type: 'address' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'category', type: 'string' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasRole',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: 'fileHash', type: 'bytes32' }],
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'evidenceId', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'submit',
    inputs: [
      { name: 'fileHash', type: 'bytes32' },
      { name: 'category', type: 'string' },
    ],
    outputs: [{ name: 'evidenceId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'totalEvidence',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'grantRole',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeRole',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
