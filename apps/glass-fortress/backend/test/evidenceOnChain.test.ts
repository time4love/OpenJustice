import { registerEvidenceOnChain } from '../src/services/evidenceOnChain';
import { DuplicateEvidenceError, type Web3Service } from '../src/services/Web3Service';

// ---------------------------------------------------------------------------
// registerEvidenceOnChain — the shared "promote" logic every promotion path
// (promoteEvidence.ts, forensicsRoutes.ts /promote, WaybackScraper.ts
// autoPromoteToEvidence) now routes through, so the risky branching
// (duplicate = success, not failure; unavailable = unconfirmed, not thrown)
// only needs verifying once here rather than re-mocked in each caller.
// ---------------------------------------------------------------------------

function mockWeb3(registerEvidenceHash: jest.Mock, findRegisteringTxHash?: jest.Mock): Web3Service {
  return { registerEvidenceHash, findRegisteringTxHash } as unknown as Web3Service;
}

describe('registerEvidenceOnChain', () => {
  it('returns unconfirmed without calling anything when web3 is null', async () => {
    const result = await registerEvidenceOnChain(null, '0xabc', ['WITHHOLDING_INFORMATION'], 'Incriminating');
    expect(result).toEqual({ confirmed: false, txHash: null });
  });

  it('returns confirmed with the tx hash on a successful registration', async () => {
    const registerEvidenceHash = jest.fn().mockResolvedValue('0xtxhash');
    const web3 = mockWeb3(registerEvidenceHash);

    const result = await registerEvidenceOnChain(web3, '0xabc', ['WITHHOLDING_INFORMATION'], 'Incriminating');

    expect(result).toEqual({ confirmed: true, txHash: '0xtxhash' });
    expect(registerEvidenceHash).toHaveBeenCalledWith(
      '0xabc',
      '0x0000000000000000000000000000000000000000',
      'WITHHOLDING_INFORMATION',
    );
  });

  it('on DuplicateEvidenceError, recovers the ORIGINAL tx hash from the event log — never fabricates one', async () => {
    const registerEvidenceHash = jest.fn().mockRejectedValue(new DuplicateEvidenceError('0xabc'));
    const findRegisteringTxHash = jest.fn().mockResolvedValue('0xoriginaltxhash');
    const web3 = mockWeb3(registerEvidenceHash, findRegisteringTxHash);

    const result = await registerEvidenceOnChain(web3, '0xabc', ['WITHHOLDING_INFORMATION'], 'Incriminating');

    expect(result).toEqual({ confirmed: true, txHash: '0xoriginaltxhash' });
    expect(findRegisteringTxHash).toHaveBeenCalledWith('0xabc');
  });

  it('on DuplicateEvidenceError, refuses to confirm if the original tx hash cannot be recovered', async () => {
    const registerEvidenceHash = jest.fn().mockRejectedValue(new DuplicateEvidenceError('0xabc'));
    const findRegisteringTxHash = jest.fn().mockResolvedValue(null);
    const web3 = mockWeb3(registerEvidenceHash, findRegisteringTxHash);

    const result = await registerEvidenceOnChain(web3, '0xabc', ['WITHHOLDING_INFORMATION'], 'Incriminating');

    // Must never be {confirmed: true, txHash: null} — CONFIRMED always needs real proof.
    expect(result).toEqual({ confirmed: false, txHash: null });
  });

  it('propagates any other registration error to the caller', async () => {
    const registerEvidenceHash = jest.fn().mockRejectedValue(new Error('insufficient funds for gas'));
    const web3 = mockWeb3(registerEvidenceHash);

    await expect(
      registerEvidenceOnChain(web3, '0xabc', ['WITHHOLDING_INFORMATION'], 'Incriminating'),
    ).rejects.toThrow('insufficient funds for gas');
  });

  it('falls back to a role-derived label when there are no categories', async () => {
    const registerEvidenceHash = jest.fn().mockResolvedValue('0xtxhash');
    const web3 = mockWeb3(registerEvidenceHash);

    await registerEvidenceOnChain(web3, '0xabc', [], 'ContextAnchor');

    expect(registerEvidenceHash).toHaveBeenCalledWith(
      '0xabc',
      '0x0000000000000000000000000000000000000000',
      'CONTEXT_ANCHOR',
    );
  });
});
