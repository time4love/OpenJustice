// Shared file constraints for anything accepting a raw evidence file — the REST
// multer config and (in a later phase) the screenshot-recovery MCP tool's manual
// size check both read these instead of duplicating the same limits.
export const ALLOWED_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
