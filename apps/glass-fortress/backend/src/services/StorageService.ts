import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';

// ---------------------------------------------------------------------------
// StorageService — Supabase Storage for evidence files
//
// Uploads evidence files (images/PDFs) to Supabase Storage bucket "evidence".
// Returns the public URL so files can be viewed in court and in the timeline UI.
//
// Prerequisites (Supabase dashboard):
//   1. Create a bucket named "evidence" (set to Public).
//   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// ---------------------------------------------------------------------------

const BUCKET = 'evidence';

export class StorageService {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!url || !key) {
      throw new Error(
        'StorageService: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.',
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  /**
   * Uploads a file buffer to the "evidence" Supabase Storage bucket.
   * Generates a UUID-based filename to prevent collisions and avoid leaking
   * the original filename.
   *
   * @returns The public URL of the uploaded file.
   */
  async uploadEvidenceFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<string> {
    const ext = path.extname(originalName).toLowerCase() || `.${mimeType.split('/')[1]}`;
    const filename = `${crypto.randomUUID()}${ext}`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(filename, fileBuffer, { contentType: mimeType, upsert: false });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const { data } = this.client.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  }

  /**
   * Deletes one or more evidence files from the "evidence" bucket, given
   * their public URLs (as returned by uploadEvidenceFile). Extracts each
   * URL's storage path rather than requiring the caller to track filenames
   * separately. Silently no-ops on an empty array — Supabase's remove()
   * would otherwise reject a zero-length path list.
   */
  async deleteEvidenceFiles(fileUrls: string[]): Promise<void> {
    if (fileUrls.length === 0) return;

    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const paths = fileUrls.map((url) => {
      const idx = url.indexOf(marker);
      if (idx === -1) {
        throw new Error(`Not a recognised "${BUCKET}" bucket public URL: ${url}`);
      }
      return url.slice(idx + marker.length);
    });

    const { error } = await this.client.storage.from(BUCKET).remove(paths);
    if (error) {
      throw new Error(`Supabase Storage delete failed: ${error.message}`);
    }
  }
}
