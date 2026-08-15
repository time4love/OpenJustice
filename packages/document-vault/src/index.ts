export type { EncryptInput, EncryptResult } from './encrypt';
export { encrypt, decrypt } from './encrypt';

export type { StripResult } from './strip';
export { stripMetadata } from './strip';

export type { IpfsConfig } from './ipfs';
export { uploadToIPFS, fetchFromIPFS } from './ipfs';

export {
  wrapKey,
  unwrapKey,
  generateViewerKeyPair,
  protectPrivateKey,
  recoverPrivateKey,
  generateSalt,
} from './keyEnvelope';
