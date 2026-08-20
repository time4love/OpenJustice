const mockRemove = jest.fn();
const mockFrom = jest.fn(() => ({ remove: mockRemove }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ storage: { from: mockFrom } })),
}));

import { StorageService } from '../src/services/StorageService';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['SUPABASE_URL'] = 'https://project-ref.supabase.co';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
});

describe('StorageService.deleteEvidenceFiles', () => {
  it('no-ops on an empty array without calling Supabase Storage', async () => {
    const storage = new StorageService();
    await storage.deleteEvidenceFiles([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('extracts the storage path from each public URL and removes them all in one call', async () => {
    mockRemove.mockResolvedValue({ error: null });
    const storage = new StorageService();

    await storage.deleteEvidenceFiles([
      'https://project-ref.supabase.co/storage/v1/object/public/evidence/a1b2.jpg',
      'https://project-ref.supabase.co/storage/v1/object/public/evidence/c3d4.png',
    ]);

    expect(mockFrom).toHaveBeenCalledWith('evidence');
    expect(mockRemove).toHaveBeenCalledWith(['a1b2.jpg', 'c3d4.png']);
  });

  it('throws when a URL is not a recognised evidence-bucket public URL', async () => {
    const storage = new StorageService();

    await expect(
      storage.deleteEvidenceFiles(['https://not-a-real-bucket.example.com/foo.jpg']),
    ).rejects.toThrow('Not a recognised "evidence" bucket public URL');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('throws when Supabase Storage returns an error', async () => {
    mockRemove.mockResolvedValue({ error: { message: 'not found' } });
    const storage = new StorageService();

    await expect(
      storage.deleteEvidenceFiles(['https://project-ref.supabase.co/storage/v1/object/public/evidence/a1b2.jpg']),
    ).rejects.toThrow('Supabase Storage delete failed: not found');
  });
});
