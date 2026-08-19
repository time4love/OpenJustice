jest.mock('../src/lib/prisma', () => ({
  prisma: {
    oidcModel: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { PrismaOidcAdapter } from '../src/oauth/prismaOidcAdapter';

// ---------------------------------------------------------------------------
// PrismaOidcAdapter — the storage layer oidc-provider calls for every model
// kind (Client, Grant, AccessToken, ...). Verifies the translation between
// oidc-provider's Adapter contract and the generic OidcModel table: expiry
// filtering, the `consumed` timestamp surfacing convention, and — the one
// deliberately cross-kind method — revokeByGrantId not scoping by modelName.
// ---------------------------------------------------------------------------

const mockUpsert = prisma.oidcModel.upsert as jest.Mock;
const mockFindUnique = prisma.oidcModel.findUnique as jest.Mock;
const mockUpdate = prisma.oidcModel.update as jest.Mock;
const mockDeleteMany = prisma.oidcModel.deleteMany as jest.Mock;

describe('PrismaOidcAdapter', () => {
  const adapter = new PrismaOidcAdapter('AccessToken');

  describe('upsert', () => {
    it('stores the payload and computes expiresAt from expiresIn', async () => {
      const before = Date.now();
      await adapter.upsert('tok-1', { accountId: 'r-1', grantId: 'g-1' }, 3600);

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const call = mockUpsert.mock.calls[0][0];
      expect(call.where).toEqual({ modelName_id: { modelName: 'AccessToken', id: 'tok-1' } });
      expect(call.create).toMatchObject({
        modelName: 'AccessToken',
        id: 'tok-1',
        grantId: 'g-1',
        accountId: 'r-1',
        userCode: null,
        uid: null,
      });
      const expiresAt: Date = call.create.expiresAt;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
    });

    it('leaves expiresAt null when no expiresIn is given', async () => {
      await adapter.upsert('tok-2', { accountId: 'r-1' });
      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.expiresAt).toBeNull();
    });

    it('extracts userCode and uid alongside grantId/accountId', async () => {
      await adapter.upsert('sess-1', { uid: 'u-1', userCode: 'ABCD1234' });
      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.uid).toBe('u-1');
      expect(call.create.userCode).toBe('ABCD1234');
    });
  });

  describe('find', () => {
    it('returns undefined when the row does not exist', async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      await expect(adapter.find('missing')).resolves.toBeUndefined();
    });

    it('returns undefined when the row is expired', async () => {
      mockFindUnique.mockResolvedValueOnce({
        payload: { accountId: 'r-1' },
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
      });
      await expect(adapter.find('expired')).resolves.toBeUndefined();
    });

    it('returns the raw payload when not consumed', async () => {
      mockFindUnique.mockResolvedValueOnce({
        payload: { accountId: 'r-1' },
        expiresAt: null,
        consumedAt: null,
      });
      await expect(adapter.find('live')).resolves.toEqual({ accountId: 'r-1' });
    });

    it('adds a consumed unix-seconds timestamp when consumedAt is set', async () => {
      const consumedAt = new Date('2026-01-01T00:00:00.000Z');
      mockFindUnique.mockResolvedValueOnce({
        payload: { accountId: 'r-1' },
        expiresAt: null,
        consumedAt,
      });
      const result = await adapter.find('used');
      expect(result).toEqual({ accountId: 'r-1', consumed: Math.floor(consumedAt.getTime() / 1000) });
    });
  });

  describe('findByUserCode / findByUid', () => {
    it('findByUserCode queries on the (modelName, userCode) unique key', async () => {
      mockFindUnique.mockResolvedValueOnce({ payload: {}, expiresAt: null, consumedAt: null });
      await adapter.findByUserCode('ABCD1234');
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { modelName_userCode: { modelName: 'AccessToken', userCode: 'ABCD1234' } },
      });
    });

    it('findByUid queries on the (modelName, uid) unique key', async () => {
      mockFindUnique.mockResolvedValueOnce({ payload: {}, expiresAt: null, consumedAt: null });
      await adapter.findByUid('u-1');
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { modelName_uid: { modelName: 'AccessToken', uid: 'u-1' } },
      });
    });
  });

  describe('consume', () => {
    it('sets consumedAt on the row', async () => {
      await adapter.consume('tok-1');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { modelName_id: { modelName: 'AccessToken', id: 'tok-1' } },
        data: { consumedAt: expect.any(Date) },
      });
    });
  });

  describe('destroy', () => {
    it('deletes scoped to this adapter instance\'s modelName', async () => {
      await adapter.destroy('tok-1');
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { modelName: 'AccessToken', id: 'tok-1' },
      });
    });
  });

  describe('revokeByGrantId', () => {
    it('deletes every row with this grantId regardless of modelName', async () => {
      await adapter.revokeByGrantId('g-1');
      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { grantId: 'g-1' } });
      // Deliberately NOT { modelName: 'AccessToken', grantId: 'g-1' } — a grant's
      // AuthorizationCode/RefreshToken/AccessToken rows must all die together.
    });
  });
});
