import { uploadToIPFS, fetchFromIPFS } from '../src/ipfs';

const FAKE_CID = 'QmTestCID123abc';
const FAKE_JWT = 'test-jwt-token';
const CIPHERTEXT = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]);

describe('uploadToIPFS', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('posts to Pinata with Authorization header and returns CID (v3 API)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { cid: FAKE_CID } }),
    });

    const cid = await uploadToIPFS(CIPHERTEXT, { pinataJwt: FAKE_JWT });

    expect(cid).toBe(FAKE_CID);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('pinata.cloud'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${FAKE_JWT}` }),
      }),
    );
  });

  it('handles Pinata v2 IpfsHash response format', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ IpfsHash: FAKE_CID }),
    });

    const cid = await uploadToIPFS(CIPHERTEXT, { pinataJwt: FAKE_JWT });
    expect(cid).toBe(FAKE_CID);
  });

  it('throws on non-ok response', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(uploadToIPFS(CIPHERTEXT, { pinataJwt: FAKE_JWT })).rejects.toThrow('401');
  });

  it('throws when response has no CID field', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    await expect(uploadToIPFS(CIPHERTEXT, { pinataJwt: FAKE_JWT })).rejects.toThrow('CID');
  });
});

describe('fetchFromIPFS', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('fetches from the default Pinata gateway when no gatewayUrl configured', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => CIPHERTEXT.buffer.slice(0),
    });

    const result = await fetchFromIPFS(FAKE_CID, {});

    expect(result).toEqual(CIPHERTEXT);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining(FAKE_CID));
  });

  it('uses a custom gatewayUrl when provided', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => CIPHERTEXT.buffer.slice(0),
    });

    await fetchFromIPFS(FAKE_CID, { gatewayUrl: 'https://my-node.example/ipfs' });

    expect(globalThis.fetch).toHaveBeenCalledWith('https://my-node.example/ipfs/QmTestCID123abc');
  });

  it('throws on non-ok response', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(fetchFromIPFS(FAKE_CID, {})).rejects.toThrow('404');
  });
});
